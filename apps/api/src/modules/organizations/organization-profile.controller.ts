import { BadRequestException, Body, Controller, Get, Header, Headers, Post, UseGuards } from "@nestjs/common";
import { saveOrganizationProfileSchema } from "@marketplace/schemas";
import { ApiCoreBody, ApiCoreErrors, ApiCoreProtected, ApiCoreResponse } from "../../platform/openapi/core-openapi";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { OrganizationProfileService } from "./organization-profile.service";

@Controller("organizations/current/profile")
@UseGuards(PermissionsGuard)
@ApiCoreProtected() @ApiCoreErrors()
export class OrganizationProfileController {
  constructor(private readonly profiles: OrganizationProfileService) {}
  @Get() @Header("Cache-Control", "no-store") @RequirePermissions("organization.view") @ApiCoreResponse("OrganizationProfileResponse")
  current(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.profiles.current({ actorId, organizationId }); }

  @Post() @RequirePermissions("organization.members.manage")
  @ApiCoreBody("SaveOrganizationProfileRequest") @ApiCoreResponse("OrganizationProfileResponse", 201, "Own organization; version conflict 409. Idempotency key, addresses, audit and outbox commit atomically.")
  save(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = saveOrganizationProfileSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.profiles.save(parsed.data, { actorId, organizationId });
  }
}
