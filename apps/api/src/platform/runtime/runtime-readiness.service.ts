import { Injectable } from "@nestjs/common";
import { BackgroundQueueService } from "../jobs/background-queue.service";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStorageService } from "../storage/object-storage.service";
import { environment } from "../config/environment";
import { runtimeCapabilities } from "./process-role";

type DependencyCheck = { status: string; error?: string; [key: string]: unknown };

@Injectable()
export class RuntimeReadinessService {
  constructor(private readonly prisma: PrismaService, private readonly queue: BackgroundQueueService, private readonly storage: ObjectStorageService) {}

  async snapshot() {
    const config = environment();
    const capabilities = runtimeCapabilities(config.PROCESS_ROLE);
    const checks: Record<string, DependencyCheck> = {};
    try { await this.prisma.$queryRaw`SELECT 1`; checks.database = { status: "ok" }; } catch (error) { checks.database = { status: "down", error: error instanceof Error ? error.message : "Database unavailable" }; }
    try { checks.storage = await this.storage.health(); } catch (error) { checks.storage = { status: "down", error: error instanceof Error ? error.message : "Storage unavailable" }; }
    try { checks.queue = await this.queue.health(); } catch (error) { checks.queue = { status: "down", error: error instanceof Error ? error.message : "Queue unavailable" }; }
    const requiredChecks = ["database", "storage", ...(config.BACKGROUND_QUEUE_ENABLED ? ["queue"] : [])];
    const ready = requiredChecks.every((name) => checks[name]?.status === "ok");
    return { status: ready ? "ready" as const : "not_ready" as const, role: config.PROCESS_ROLE, capabilities, requiredChecks, checks };
  }
}
