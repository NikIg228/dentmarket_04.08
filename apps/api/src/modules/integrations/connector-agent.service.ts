import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { parseConnectorAgentJobResult, type CompleteIntegrationJobInput, type ConnectorAgentHeartbeatInput, type EnrollConnectorAgentInput, type FailIntegrationJobInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { IntegrationCryptoService } from "./integration-crypto.service";
import { IntegrationJobsService } from "./integration-jobs.service";
import { ExternalReservationsService } from "./external-reservations.service";
import { IntegrationExecutionService } from "./integration-execution.service";

@Injectable()
export class ConnectorAgentService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: IntegrationCryptoService, private readonly jobs: IntegrationJobsService, private readonly externalReservations: ExternalReservationsService, private readonly execution: IntegrationExecutionService) {}

  async enroll(agentId: string, input: EnrollConnectorAgentInput, ipAddress?: string) {
    const agent = await this.prisma.connectorAgent.findUnique({ where: { agentId }, include: { connection: true } });
    if (!agent || !agent.enrollmentTokenHash || !agent.enrollmentExpiresAt) throw new UnauthorizedException("Agent enrollment is not available");
    if (agent.enrollmentExpiresAt.getTime() < Date.now() || !this.crypto.tokensMatch(input.enrollmentToken, agent.enrollmentTokenHash)) throw new UnauthorizedException("Agent enrollment token is invalid or expired");
    if (agent.connection.provider !== "ONE_C" || agent.connection.status === "REVOKED") throw new ConflictException("Connector connection is not enrollable");
    const accessToken = this.crypto.token();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.connectorAgent.update({ where: { id: agent.id }, data: { status: "ACTIVE", version: input.version, capabilities: input.capabilities, accessTokenHash: this.crypto.hashToken(accessToken), enrollmentTokenHash: null, enrollmentExpiresAt: null, lastHeartbeatAt: now, lastIpAddress: ipAddress } }),
      this.prisma.integrationConnection.update({ where: { id: agent.connectionId }, data: { status: "ACTIVE", lastHeartbeatAt: now, lastError: null } }),
    ]);
    return { agentId, accessToken, minimumSupportedVersion: agent.minimumSupportedVersion, heartbeatIntervalSeconds: 30, claimIntervalSeconds: 5 };
  }

  async heartbeat(agentId: string, authorization: string | undefined, input: ConnectorAgentHeartbeatInput, ipAddress?: string) {
    const agent = await this.authenticate(agentId, authorization);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.connectorAgent.update({ where: { id: agent.id }, data: { status: "ACTIVE", version: input.version, capabilities: input.capabilities as Prisma.InputJsonValue, lastHeartbeatAt: now, lastIpAddress: ipAddress, lastError: input.lastError } }),
      this.prisma.integrationConnection.update({ where: { id: agent.connectionId }, data: { status: input.lastError ? "ERROR" : "ACTIVE", lastHeartbeatAt: now, lastErrorAt: input.lastError ? now : undefined, lastError: input.lastError } }),
    ]);
    return { accepted: true, serverTime: now.toISOString() };
  }

  async claim(agentId: string, authorization: string | undefined) {
    const agent = await this.authenticate(agentId, authorization);
    const workerId = this.workerId(agent.id);
    for (let index = 0; index < 5; index += 1) {
      const job = await this.jobs.claimForAgent(agent.connectionId, workerId);
      if (!job) return { job: null };
      if (["FULL_SYNC", "INCREMENTAL_SYNC"].includes(job.type)) {
        const expanded = await this.execution.enqueueCompositeSync(job);
        await this.jobs.complete(job.id, workerId, expanded);
        continue;
      }
      return { job: { id: job.id, type: job.type, trigger: job.trigger, payload: job.payload, cursor: job.cursor, attempt: job.attempt, maxAttempts: job.maxAttempts, correlationId: job.correlationId } };
    }
    return { job: null };
  }

  async complete(agentId: string, authorization: string | undefined, jobId: string, input: CompleteIntegrationJobInput) {
    const agent = await this.authenticate(agentId, authorization);
    const job = await this.prisma.integrationSyncJob.findFirst({ where: { id: jobId, connectionId: agent.connectionId } });
    if (!job) throw new NotFoundException("Integration job not found for this agent");
    const parsedResult = parseConnectorAgentJobResult(job.type, input.result);
    if (!parsedResult.success) {
      throw new BadRequestException({
        code: "INVALID_CONNECTOR_JOB_RESULT",
        message: "Connector job result does not match the job contract",
        details: parsedResult.error.flatten(),
      });
    }
    const result = parsedResult.data as Record<string, unknown>;
    const workerId = this.workerId(agent.id);
    const completion = await this.jobs.acquireCompletion(jobId, agent.connectionId, workerId);
    try {
      const application = await this.execution.applyAgentResult(completion.job, result);
      await this.externalReservations.finalizeAgentJob(jobId, result);
      const nextCursor = result.nextCursor && typeof result.nextCursor === "object" && !Array.isArray(result.nextCursor)
        ? result.nextCursor as Record<string, unknown>
        : null;
      const completed = await this.jobs.complete(jobId, completion.workerId, result, nextCursor);
      return { ...completed, application };
    } catch (error) {
      await this.jobs.releaseCompletion(jobId, completion.workerId, workerId);
      throw error;
    }
  }

  async fail(agentId: string, authorization: string | undefined, jobId: string, input: FailIntegrationJobInput) {
    const agent = await this.authenticate(agentId, authorization);
    const job = await this.prisma.integrationSyncJob.findFirst({ where: { id: jobId, connectionId: agent.connectionId } });
    if (!job) throw new NotFoundException("Integration job not found for this agent");
    return this.jobs.fail(jobId, this.workerId(agent.id), input.error, input.retryable);
  }

  private async authenticate(agentId: string, authorization?: string) {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Connector agent bearer token is required");
    const agent = await this.prisma.connectorAgent.findUnique({ where: { agentId } });
    if (!agent || agent.status === "REVOKED" || !agent.accessTokenHash || !this.crypto.tokensMatch(token, agent.accessTokenHash)) throw new UnauthorizedException("Connector agent token is invalid");
    return agent;
  }

  private workerId(agentId: string) { return `agent:${agentId}`; }
}
