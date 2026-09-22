import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from "@nestjs/common";
import { acceptSupplierTermsSchema, reviewSupplierAdmissionSchema } from "@marketplace/schemas";
import { ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ApiCoreBody, ApiCoreErrors, ApiCoreProtected, ApiCoreResponse, ApiUuidParam } from "../../platform/openapi/core-openapi";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { SupplierLegalDocuments } from "./supplier-legal-documents";
import { SupplierTermsService } from "./supplier-terms.service";

@ApiTags("supplier-terms")
@ApiCoreErrors()
@UseGuards(PermissionsGuard)
@Controller("supplier-terms")
export class SupplierTermsController {
  constructor(private readonly terms: SupplierTermsService, private readonly legal: SupplierLegalDocuments) {}
  @Get("documents") @ApiCoreResponse("SupplierLegalBundleResponse")
  documents() { return this.legal.current(); }

  @Get("current") @RequirePermissions("document.view") @ApiCoreProtected() @ApiCoreResponse("SupplierTermsStateResponse")
  current(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.terms.current({ actorId, organizationId }); }

  @Post("acceptances") @RequirePermissions("document.sign") @ApiCoreProtected()
  @ApiCoreBody("AcceptSupplierTermsRequest") @ApiCoreResponse("SupplierTermsAcceptanceResponse", 201, "Idempotent per organization and exact document bundle; admission remains pending.")
  accept(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string, @Req() request: Request) {
    const parsed = acceptSupplierTermsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.terms.accept(parsed.data, { actorId, organizationId }, { ipAddress: request.ip ?? request.socket.remoteAddress ?? null, userAgent: request.get("user-agent") ?? null });
  }

  @Get("operator/acceptances") @RequirePermissions("document.view") @ApiCoreProtected() @ApiCoreResponse("SupplierAdmissionListResponse")
  list(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.terms.list({ actorId, organizationId }); }

  @Post("operator/acceptances/:id/review") @RequirePermissions("document.manage") @ApiCoreProtected() @ApiUuidParam("id")
  @ApiCoreBody("ReviewSupplierAdmissionRequest") @ApiCoreResponse("SupplierTermsAcceptanceResponse", 201, "Platform operator only; optimistic version conflict returns 409. Audit and outbox are atomic.")
  review(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = reviewSupplierAdmissionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.terms.review(id, parsed.data, { actorId, organizationId });
  }

  @Get("acceptances/:id/download") @RequirePermissions("document.view") @ApiCoreProtected() @ApiUuidParam("id")
  @ApiProduces("text/plain") @ApiResponse({ status: 200, description: "Immutable accepted texts and acceptance receipt, UTF-8", schema: { type: "string" } })
  async download(@Param("id", ParseUUIDPipe) id: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string, @Res() response: Response) {
    const text = await this.terms.download(id, { actorId, organizationId });
    response.setHeader("Content-Disposition", `attachment; filename="supplier-terms-${id}.txt"`);
    response.setHeader("Cache-Control", "private, no-store");
    response.type("text/plain; charset=utf-8").send(text);
  }
}
