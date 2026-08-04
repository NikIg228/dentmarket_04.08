import "./instrumentation";
import "reflect-metadata";
import { createMarketplaceApp } from "./bootstrap";
import { environment } from "./platform/config/environment";
import { runtimeCapabilities } from "./platform/runtime/process-role";

async function bootstrap() {
  const config = environment();
  if (!runtimeCapabilities(config.PROCESS_ROLE).http) throw new Error("PROCESS_ROLE=worker must be started with the worker entrypoint");
  const app = await createMarketplaceApp();
  await app.listen(config.API_PORT, config.API_HOST);
}

void bootstrap();
