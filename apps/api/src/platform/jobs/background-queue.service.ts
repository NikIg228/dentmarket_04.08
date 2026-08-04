import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { environment } from "../config/environment";
import { runtimeCapabilities } from "../runtime/process-role";

type QueuePayload = Record<string, unknown>;
type QueueHandler = (payload: QueuePayload, jobId: string | undefined) => Promise<unknown>;

@Injectable()
export class BackgroundQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundQueueService.name);
  private readonly handlers = new Map<string, QueueHandler>();
  private queue?: Queue<QueuePayload>;
  private worker?: Worker<QueuePayload>;
  private producerConnection?: IORedis;
  private workerConnection?: IORedis;
  private available = false;
  private consumerAvailable = false;

  get enabled() { return this.available; }

  register(name: string, handler: QueueHandler) {
    if (this.handlers.has(name)) throw new Error(`Background handler ${name} is already registered`);
    this.handlers.set(name, handler);
  }

  async onModuleInit() {
    const config = environment();
    const capabilities = runtimeCapabilities(config.PROCESS_ROLE);
    if (!config.BACKGROUND_QUEUE_ENABLED || !config.REDIS_URL) {
      this.logger.warn(capabilities.schedules ? "Redis queue disabled; scheduled services use database-backed inline fallback" : "Redis queue disabled for API producer");
      return;
    }
    try {
      this.producerConnection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: true });
      await this.producerConnection.connect();
      this.queue = new Queue<QueuePayload>("marketplace-background", { connection: this.producerConnection });
      if (capabilities.queueConsumer) {
        this.workerConnection = this.producerConnection.duplicate();
        await this.workerConnection.connect();
        this.worker = new Worker<QueuePayload>("marketplace-background", async (job) => {
          const handler = this.handlers.get(job.name);
          if (!handler) throw new Error(`No handler registered for background job ${job.name}`);
          return handler(job.data, job.id);
        }, { connection: this.workerConnection, concurrency: config.BACKGROUND_QUEUE_CONCURRENCY });
        this.worker.on("failed", (job, error) => this.logger.error(`Background job ${job?.name ?? "unknown"}/${job?.id ?? "unknown"} failed: ${error.message}`));
        this.consumerAvailable = true;
      }
      this.available = true;
      this.logger.log(capabilities.queueConsumer ? "BullMQ producer and consumer connected" : "BullMQ producer connected; consumer disabled for API role");
    } catch (error) {
      this.available = false;
      await this.close();
      if (config.NODE_ENV === "production") throw error;
      this.logger.warn(`Redis unavailable; inline fallback enabled: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async enqueue(name: string, payload: QueuePayload = {}, options: JobsOptions = {}) {
    if (!this.queue || !this.available) return false;
    await this.queue.add(name, payload, { attempts: 5, backoff: { type: "exponential", delay: 2_000 }, removeOnComplete: 500, removeOnFail: 2_000, ...options });
    return true;
  }

  async health() {
    const config = environment();
    const capabilities = runtimeCapabilities(config.PROCESS_ROLE);
    if (!config.BACKGROUND_QUEUE_ENABLED) return { status: "ok" as const, configured: false, producer: "disabled" as const, consumer: "disabled" as const };
    if (!this.available || !this.producerConnection || !this.queue) return { status: "down" as const, configured: true, producer: "down" as const, consumer: capabilities.queueConsumer ? "down" as const : "not_required" as const };
    const [pong, counts] = await Promise.all([this.producerConnection.ping(), this.queue.getJobCounts("waiting", "active", "failed", "delayed")]);
    const producerReady = pong === "PONG";
    const consumerReady = !capabilities.queueConsumer || this.consumerAvailable;
    return { status: producerReady && consumerReady ? "ok" as const : "down" as const, configured: true, producer: producerReady ? "ready" as const : "down" as const, consumer: capabilities.queueConsumer ? (this.consumerAvailable ? "ready" as const : "down" as const) : "not_required" as const, counts };
  }

  async onModuleDestroy() { await this.close(); }

  private async close() {
    await Promise.allSettled([this.worker?.close(), this.queue?.close()]);
    await Promise.allSettled([this.workerConnection?.quit(), this.producerConnection?.quit()]);
    this.worker = undefined; this.queue = undefined; this.workerConnection = undefined; this.producerConnection = undefined;
    this.available = false; this.consumerAvailable = false;
  }
}
