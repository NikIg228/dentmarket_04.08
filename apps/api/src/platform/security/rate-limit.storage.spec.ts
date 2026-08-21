import { describe, expect, it, vi } from "vitest";
import {
  RedisThrottlerStorage,
  type RedisRateLimitClient,
} from "./rate-limit.storage";

const client = (result: unknown): RedisRateLimitClient => ({
  status: "ready",
  connect: vi.fn(),
  eval: vi.fn().mockResolvedValue(result),
  quit: vi.fn().mockResolvedValue("OK"),
});

describe("RedisThrottlerStorage", () => {
  it("uses an atomic Redis result and converts millisecond TTLs to seconds", async () => {
    const redis = client([4, 29_001, 1, 11_001]);
    const storage = new RedisThrottlerStorage(
      { nodeEnv: "production", redisUrl: "redis://unit-test" },
      redis,
    );

    await expect(
      storage.increment("key", 60_000, 3, 12_000, "ip"),
    ).resolves.toEqual({
      totalHits: 4,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 12,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      2,
      "dentmarket:rate-limit:v1:key",
      "dentmarket:rate-limit:v1:key:blocked",
      60_000,
      3,
      12_000,
    );
  });

  it("falls back to process-local storage outside production when Redis is unavailable", async () => {
    const redis: RedisRateLimitClient = {
      status: "ready",
      connect: vi.fn(),
      eval: vi.fn().mockRejectedValue(new Error("redis down")),
      quit: vi.fn().mockResolvedValue("OK"),
    };
    const storage = new RedisThrottlerStorage(
      { nodeEnv: "test", redisUrl: "redis://unit-test" },
      redis,
    );

    await expect(
      storage.increment("key", 60_000, 1, 60_000, "ip"),
    ).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
    await expect(
      storage.increment("key", 60_000, 1, 60_000, "ip"),
    ).resolves.toMatchObject({
      totalHits: 2,
      isBlocked: true,
    });
  });

  it("fails closed in production when Redis is unavailable", async () => {
    const redis: RedisRateLimitClient = {
      status: "ready",
      connect: vi.fn(),
      eval: vi.fn().mockRejectedValue(new Error("redis down")),
      quit: vi.fn().mockResolvedValue("OK"),
    };
    const storage = new RedisThrottlerStorage(
      { nodeEnv: "production", redisUrl: "redis://unit-test" },
      redis,
    );

    await expect(
      storage.increment("key", 60_000, 1, 60_000, "ip"),
    ).rejects.toMatchObject({
      status: 503,
      message: "Rate limit protection is unavailable",
    });
  });

  it("does not require Redis for local development", async () => {
    const storage = new RedisThrottlerStorage({ nodeEnv: "development" });

    await expect(
      storage.increment("key", 60_000, 1, 60_000, "ip"),
    ).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });
});
