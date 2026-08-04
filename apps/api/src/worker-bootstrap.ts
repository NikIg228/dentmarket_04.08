import "./instrumentation";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { environment } from "./platform/config/environment";
import { NestStructuredLogger, structuredLogger } from "./platform/observability/structured-logger";
import { runtimeCapabilities } from "./platform/runtime/process-role";
import { RuntimeReadinessService } from "./platform/runtime/runtime-readiness.service";

export async function bootstrapWorker() {
  const config = environment();
  const capabilities = runtimeCapabilities(config.PROCESS_ROLE);
  if (capabilities.http || !capabilities.queueConsumer || !capabilities.schedules) throw new Error("The worker entrypoint requires PROCESS_ROLE=worker");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: new NestStructuredLogger() });
  app.enableShutdownHooks();
  const snapshot = await app.get(RuntimeReadinessService).snapshot();
  if (snapshot.status !== "ready") {
    await app.close();
    throw new Error(`Worker is not ready: ${JSON.stringify(snapshot.checks)}`);
  }
  structuredLogger.info({ event: "runtime.ready", role: config.PROCESS_ROLE, capabilities, requiredChecks: snapshot.requiredChecks }, "Marketplace worker ready");
  return app;
}
