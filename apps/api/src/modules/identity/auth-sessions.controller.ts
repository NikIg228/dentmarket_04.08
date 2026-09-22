import { BadRequestException, Body, Controller, Delete, Get, Header, Headers, Param, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { localOperatorLoginSchema, workspaceHandoffRequestSchema, workspaceExchangeRequestSchema } from "@marketplace/schemas";
import { ApiCoreBody, ApiCoreProtected, ApiCoreResponse } from "../../platform/openapi/core-openapi";
import { demoSessionSchema, emailForgotPasswordSchema, emailLoginSchema, emailRegisterSchema, emailResetPasswordSchema, emailTokenSchema, refreshSessionSchema, revokeSessionSchema, socialExchangeSchema, switchSessionOrganizationSchema, unlinkExternalIdentitySchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { environment } from "../../platform/config/environment";
import { AuthSessionsService } from "./auth-sessions.service";
import { Throttle } from "@nestjs/throttler";

const cookies = (header: string | undefined) => Object.fromEntries((header ?? "").split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
const equal = (left: string, right: string) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };

@ApiTags("auth-sessions")
@Throttle({ ip: { limit: 20, ttl: 60_000 }, user: { limit: 30, ttl: 60_000 }, tenant: { limit: 60, ttl: 60_000 } })
@Controller("auth")
export class AuthSessionsController {
  constructor(private readonly sessions: AuthSessionsService) {}
  private metadata(request: Request) { return { ipAddress: request.ip, userAgent: request.header("user-agent"), correlationId: request.header("x-request-id") }; }
  private setCookies(response: Response, refreshToken: string, csrfToken: string, expiresAt: Date | string, workspace?: "BUYER" | "SUPPLIER") {
    const config = environment();
    const common = { secure: config.NODE_ENV === "production", sameSite: "lax" as const, domain: config.AUTH_COOKIE_DOMAIN, path: "/api/auth", expires: new Date(expiresAt) };
    const suffix = workspace ? `_${workspace.toLowerCase()}` : "";
    response.cookie(`mp_refresh${suffix}`, refreshToken, { ...common, httpOnly: true });
    response.cookie(`mp_csrf${suffix}`, csrfToken, { ...common, path: "/", httpOnly: false });
  }

  @Post("social/exchange")
  async exchange(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = socialExchangeSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.sessions.exchange(parsed.data, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url");
    this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("register")
  @ApiCoreBody("AuthEmailRegisterRequest") @ApiCoreResponse("AuthRegistrationAcceptedResponse", 201) @ApiCoreResponse("ErrorResponse", 503)
  async register(@Body() body: unknown, @Req() request: Request) {
    const parsed = emailRegisterSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.sessions.registerEmail(parsed.data, this.metadata(request));
  }

  @Post("login")
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = emailLoginSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.sessions.loginEmail(parsed.data, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url"); this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("email/verify")
  async verifyEmail(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = emailTokenSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.sessions.verifyEmail(parsed.data.token, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url"); this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("password/forgot")
  @ApiCoreBody("AuthForgotRequest") @ApiCoreResponse("AuthForgotAcceptedResponse", 201) @ApiCoreResponse("ErrorResponse", 503)
  forgotPassword(@Body() body: unknown) { const parsed = emailForgotPasswordSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.forgotPassword(parsed.data.email); }

  @Get("client-options") @Header("Cache-Control", "no-store")
  @ApiCoreResponse("AuthClientOptionsResponse")
  clientOptions() { return this.sessions.clientOptions(); }

  @Get("workspace-context") @Header("Cache-Control", "no-store")
  @ApiCoreProtected()
  @ApiCoreResponse("WorkspaceContextResponse")
  @ApiCoreResponse("ErrorResponse", 401) @ApiCoreResponse("ErrorResponse", 403) @ApiCoreResponse("ErrorResponse", 429)
  workspaceContext(@Headers("x-user-id") userId: string, @Headers("x-organization-id") organizationId: string) {
    return this.sessions.workspaceContext(userId, organizationId);
  }

  @Get("workspaces") @Header("Cache-Control", "no-store") @ApiCoreProtected()
  @ApiCoreResponse("WorkspaceChoicesResponse")
  workspaces(@Headers("x-user-id") userId: string) { return this.sessions.workspaceChoices(userId); }

  @Post("local-operator/login") @Header("Cache-Control", "no-store")
  @ApiCoreBody("LocalOperatorLoginRequest") @ApiCoreResponse("LocalOperatorSessionResponse", 201)
  @ApiCoreResponse("ErrorResponse", 400) @ApiCoreResponse("ErrorResponse", 401) @ApiCoreResponse("ErrorResponse", 404) @ApiCoreResponse("ErrorResponse", 429)
  async localOperatorLogin(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = localOperatorLoginSchema.safeParse(body); if (!parsed.success) throw new BadRequestException("Проверьте email и пароль");
    const result = await this.sessions.loginLocalOperator(parsed.data, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url"); this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("password/reset")
  resetPassword(@Body() body: unknown) { const parsed = emailResetPasswordSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.resetPassword(parsed.data.token, parsed.data.password); }

  @Post("demo")
  async demo(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    if (!environment().PUBLIC_DEMO_MODE) throw new UnauthorizedException("Демонстрационный вход отключён");
    const parsed = demoSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.sessions.demo(parsed.data.capability, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url");
    this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("handoff")
  @Header("Cache-Control", "no-store") @ApiCoreProtected()
  @ApiCoreBody("WorkspaceHandoffRequest") @ApiCoreResponse("WorkspaceHandoffResponse", 201)
  createHandoff(@Headers("x-user-id") userId: string, @Headers("x-organization-id") organizationId: string, @Headers("x-session-id") sessionId: string, @Body() body: unknown) {
    const parsed = workspaceHandoffRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Выберите кабинет клиники или поставщика");
    if (!userId || !organizationId || !sessionId) throw new UnauthorizedException("Authenticated session and organization are required");
    return this.sessions.createHandoff(userId, organizationId, parsed.data.capability, sessionId);
  }

  @Post("handoff/exchange")
  @Header("Cache-Control", "no-store")
  @ApiCoreBody("WorkspaceExchangeRequest") @ApiCoreResponse("WorkspaceSessionResponse", 201)
  async exchangeHandoff(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = workspaceExchangeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("handoffCode is required");
    const result = await this.sessions.exchangeHandoff(parsed.data.handoffCode, this.metadata(request));
    const csrfToken = randomBytes(32).toString("base64url");
    this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt, result.capability);
    return { ...result, refreshToken: undefined, csrfToken };
  }

  @Post("refresh")
  @Header("Cache-Control", "no-store")
  @ApiCoreBody("WorkspaceRefreshRequest") @ApiCoreResponse("WorkspaceRefreshResponse", 201)
  async refresh(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const parsed = refreshSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const cookie = cookies(request.header("cookie"));
    const suffix = parsed.data.workspace ? `_${parsed.data.workspace.toLowerCase()}` : "";
    const refreshCookie = cookie[`mp_refresh${suffix}`], csrfCookie = cookie[`mp_csrf${suffix}`];
    const refreshToken = parsed.data.refreshToken ?? refreshCookie;
    if (!refreshToken) throw new UnauthorizedException("Refresh token is required");
    if (refreshCookie) {
      const suppliedCsrf = request.header("x-csrf-token") ?? parsed.data.csrfToken;
      if (!suppliedCsrf || !csrfCookie || !equal(suppliedCsrf, csrfCookie)) throw new UnauthorizedException("CSRF validation failed");
    }
    const result = await this.sessions.rotate(refreshToken, this.metadata(request), parsed.data.expectedSessionId);
    const csrfToken = randomBytes(32).toString("base64url");
    this.setCookies(response, result.refreshToken, csrfToken, result.refreshTokenExpiresAt, parsed.data.workspace);
    return { ...result, refreshToken: refreshCookie ? undefined : result.refreshToken, csrfToken };
  }

  @Post("logout")
  async logout(@Req() request: Request, @Headers("x-user-id") userId: string | undefined, @Res({ passthrough: true }) response: Response) {
    const cookie = cookies(request.header("cookie"));
    const refreshToken = cookie.mp_refresh;
    if (refreshToken) {
      const suppliedCsrf = request.header("x-csrf-token");
      if (!suppliedCsrf || !cookie.mp_csrf || !equal(suppliedCsrf, cookie.mp_csrf)) throw new UnauthorizedException("CSRF validation failed");
      await this.sessions.revokeByRefreshToken(refreshToken, userId, "user_logout");
    }
    const config = environment();
    const common = { secure: config.NODE_ENV === "production", sameSite: "lax" as const, domain: config.AUTH_COOKIE_DOMAIN, path: "/api/auth" };
    response.clearCookie("mp_refresh", { ...common, httpOnly: true });
    response.clearCookie("mp_csrf", { ...common, path: "/", httpOnly: false });
    return { ok: true };
  }

  @Get("sessions")
  list(@Headers("x-user-id") userId: string) { if (!userId) throw new UnauthorizedException(); return this.sessions.list(userId); }

  @Post("sessions/:sessionId/revoke")
  revoke(@Param("sessionId") sessionId: string, @Headers("x-user-id") userId: string, @Body() body: unknown) { const parsed = revokeSessionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.revoke(sessionId, userId, parsed.data.reason); }

  @Post("sessions/:sessionId/organization")
  switchOrganization(@Param("sessionId") sessionId: string, @Headers("x-user-id") userId: string, @Body() body: unknown) { const parsed = switchSessionOrganizationSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.switchOrganization(sessionId, userId, parsed.data.organizationId); }

  @Delete("identities")
  unlink(@Headers("x-user-id") userId: string, @Body() body: unknown) { const parsed = unlinkExternalIdentitySchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sessions.unlink(userId, parsed.data.provider); }
}
