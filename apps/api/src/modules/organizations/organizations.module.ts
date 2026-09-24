import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { OrganizationProfileController } from "./organization-profile.controller";
import { OrganizationProfileService } from "./organization-profile.service";

@Module({ controllers: [OrganizationsController, OrganizationProfileController], providers: [OrganizationsService, OrganizationProfileService], exports: [OrganizationProfileService] })
export class OrganizationsModule {}
