import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { environment } from "./platform/config/environment";
import { ApiCoreResponse } from "./platform/openapi/core-openapi";
import { runtimeCapabilities } from "./platform/runtime/process-role";
import { RuntimeReadinessService } from "./platform/runtime/runtime-readiness.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly readiness: RuntimeReadinessService) {}

  @Get()
  @ApiOkResponse({ schema: { $ref: "#/components/schemas/HealthResponse" } })
  health() {
    const config = environment();
    return { status: "ok", service: "marketplace-api", environment: config.NODE_ENV, release: process.env.APP_RELEASE ?? "local", role: config.PROCESS_ROLE, capabilities: runtimeCapabilities(config.PROCESS_ROLE) };
  }

  @Get("ready")
  @ApiCoreResponse("ReadinessResponse")
  async ready() {
    const snapshot = await this.readiness.snapshot();
    if (snapshot.status !== "ready") throw new ServiceUnavailableException(snapshot);
    return snapshot;
  }
}
