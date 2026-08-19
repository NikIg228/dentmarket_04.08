import { Global, Module } from "@nestjs/common";
import { AccessControlController } from "./access-control.controller";
import { AccessControlService } from "./access-control.service";
import { PermissionsGuard } from "./permissions.guard";
import { PlatformAuthorityPolicy } from "./platform-authority.policy";
import { RoleManagementController } from "./role-management.controller";
import { RoleManagementService } from "./role-management.service";

@Global()
@Module({
  controllers: [AccessControlController, RoleManagementController],
  providers: [
    AccessControlService,
    PermissionsGuard,
    PlatformAuthorityPolicy,
    RoleManagementService,
  ],
  exports: [AccessControlService, PermissionsGuard, PlatformAuthorityPolicy],
})
export class AccessControlModule {}
