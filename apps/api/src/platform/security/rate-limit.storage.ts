import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnApplicationShutdown,
} from "@nestjs/common";
import {
  ThrottlerStorageService,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import IORedis from "ioredis";

export type RedisRateLimitClient = {
  status: string;
  connect: () => Promise<unknown>;
  eval: (
    script: string,
    numberOfKeys: number,
    ...args: Array<string | number>
  ) => Promise<unknown>;
  quit: () => Promise<unknown>;
};

type RateLimitStorageOptions = {
  redisUrl?: string;
  nodeEnv: "development" | "test" | "production";
};

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

const incrementScript = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  local counterTtl = redis.call('PTTL', KEYS[1])
  return { hits, counterTtl, 1, blockTtl }
end

local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local counterTtl = redis.call('PTTL', KEYS[1])

if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return { hits, tonumber(ARGV[3]), 1, tonumber(ARGV[3]) }
end

return { hits, counterTtl, 0, 0 }
`;

const secondsFromMilliseconds = (value: number) =>
  Math.max(0, Math.ceil(value / 1_000));

const parseRecord = (value: unknown): ThrottlerStorageRecord => {
  if (!Array.isArray(value) || value.length < 4) {
    throw new Error("Redis rate-limit response is malformed");
  }
  const [totalHits, timeToExpire, blocked, timeToBlockExpire] =
    value.map(Number);
  if (
    ![totalHits, timeToExpire, blocked, timeToBlockExpire].every(
      Number.isFinite,
    )
  ) {
    throw new Error("Redis rate-limit response contains non-numeric values");
  }
  return {
    totalHits,
    timeToExpire: secondsFromMilliseconds(timeToExpire),
    isBlocked: blocked === 1,
    timeToBlockExpire: secondsFromMilliseconds(timeToBlockExpire),
  };
};

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private readonly nodeEnv: RateLimitStorageOptions["nodeEnv"];
  private readonly redis?: RedisRateLimitClient;
  private fallbackLogged = false;

  constructor(options: RateLimitStorageOptions, client?: RedisRateLimitClient) {
    this.nodeEnv = options.nodeEnv;
    this.redis =
      client ??
      (options.redisUrl
        ? new IORedis(options.redisUrl, {
            enableReadyCheck: true,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
          })
        : undefined);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    try {
      await this.ensureConnected();
      const result = await this.redis.eval(
        incrementScript,
        2,
        `dentmarket:rate-limit:v1:${key}`,
        `dentmarket:rate-limit:v1:${key}:blocked`,
        ttl,
        limit,
        blockDuration,
      );
      return parseRecord(result);
    } catch (error) {
      if (this.nodeEnv === "production") {
        this.logger.error(
          `Redis rate-limit storage failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw new ServiceUnavailableException(
          "Rate limit protection is unavailable",
        );
      }
      if (!this.fallbackLogged) {
        this.fallbackLogged = true;
        this.logger.warn(
          `Redis rate limiting unavailable; using process-local fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  async onApplicationShutdown() {
    if (this.redis && this.redis.status !== "end") {
      await this.redis.quit();
    }
    this.fallback.onApplicationShutdown();
  }

  private async ensureConnected() {
    if (!this.redis || this.redis.status === "ready") return;
    if (this.redis.status === "end") {
      throw new Error("Redis rate-limit connection has ended");
    }
    await this.redis.connect();
  }
}

export { incrementScript as RATE_LIMIT_INCREMENT_SCRIPT };
