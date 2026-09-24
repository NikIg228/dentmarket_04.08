import { Controller, Get, Header, Headers, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import type { OrganizationOnboarding } from "@marketplace/schemas";
import { ApiCoreErrors, ApiCoreProtected, ApiCoreResponse, ApiUuidParam } from "../../platform/openapi/core-openapi";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { PlatformAuthorityPolicy } from "../access-control/platform-authority.policy";
import { OrganizationProfileService, organizationProfileFields, supplierOrganizationPrerequisites } from "../organizations/organization-profile.service";
import { SupplierTermsService } from "./supplier-terms.service";

@Controller("organizations") @UseGuards(PermissionsGuard) @ApiCoreProtected() @ApiCoreErrors()
export class OrganizationOnboardingController {
  constructor(private readonly profiles: OrganizationProfileService, private readonly prisma: PrismaService,
    private readonly terms: SupplierTermsService, private readonly authority: PlatformAuthorityPolicy) {}

  @Get("current/onboarding") @Header("Cache-Control", "no-store") @RequirePermissions("organization.view") @ApiCoreResponse("OrganizationOnboardingResponse")
  async current(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string): Promise<OrganizationOnboarding> {
    const organization = await this.profiles.current({ actorId, organizationId });
    return this.readiness(organization);
  }

  @Get(":id/onboarding") @Header("Cache-Control", "no-store") @RequirePermissions("organization.view") @ApiUuidParam("id") @ApiCoreResponse("OrganizationOnboardingResponse")
  async operator(@Param("id", ParseUUIDPipe) id: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    await this.authority.assertPlatformOperator({ actorId, organizationId });
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id } });
    const profile = await organizationProfileFields(this.prisma, id);
    return this.readiness({ organizationId: id, legalName: organization.legalName, displayName: organization.displayName, bin: organization.bin,
      version: organization.version, profile, complete: Boolean(profile), canEdit: false });
  }

  private async readiness(organization: OrganizationOnboarding["organization"]): Promise<OrganizationOnboarding> {
    const supplier = await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId: organization.organizationId, capability: "SUPPLIER" } } });
    const steps: OrganizationOnboarding["steps"] = [{ id: "organization", label: "Реквизиты и контакты", complete: organization.complete,
      reason: organization.complete ? null : "Заполните контакты, юридический адрес и адрес доставки", action: "profile" }];
    if (!supplier) return { organization, capability: "BUYER", ready: organization.complete, steps };
    const prerequisites = await supplierOrganizationPrerequisites(this.prisma, organization.organizationId);
    const terms = await this.terms.commercialState(organization.organizationId);
    const bundle = this.terms.documentsAvailable();
    steps.push(
      { id: "warehouse", label: "Склад", complete: prerequisites.warehouseComplete, reason: prerequisites.warehouseComplete ? null : "Добавьте активный склад с городом и адресом", action: "warehouse" },
      { id: "credentials", label: "Документы организации", complete: prerequisites.credentialsComplete, reason: prerequisites.credentialsComplete ? null : "Загрузите документы организации и дождитесь их проверки", action: "compliance" },
      { id: "agreement", label: "Общие условия приняты", complete: terms.contractAccepted, reason: terms.contractAccepted ? null : bundle ? "Ознакомьтесь с актуальными условиями от имени организации" : "Утверждённые тексты ещё не опубликованы. Принятие пока недоступно", action: "documents" },
      { id: "admission", label: "Допуск оператора", complete: terms.admitted, reason: terms.admitted ? null : terms.acceptance?.reviewReason ?? "После принятия условий оператор проверит организацию и полномочия представителя", action: "wait" },
    );
    return { organization, capability: "SUPPLIER", ready: steps.every(step => step.complete), steps };
  }
}
