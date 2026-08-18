import { Injectable, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BackgroundQueueService } from "../jobs/background-queue.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";

@Injectable()
export class OutboxWorkerService implements OnModuleInit {
  private running = false;

  constructor(
    private readonly dispatcher: OutboxDispatcherService,
    private readonly backgroundQueue: BackgroundQueueService,
  ) {}

  onModuleInit() {
    this.backgroundQueue.register("outbox.tick", async () => this.tick());
  }

  @Cron("*/2 * * * * *")
  async scheduledTick() {
    const slot = Math.floor(Date.now() / 2_000);
    if (
      !(await this.backgroundQueue.enqueue(
        "outbox.tick",
        {},
        { jobId: `outbox-${slot}` },
      ))
    ) {
      await this.tick();
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatcher.dispatchBatch();
    } finally {
      this.running = false;
    }
  }
}
