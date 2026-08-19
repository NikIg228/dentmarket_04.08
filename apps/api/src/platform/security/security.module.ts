import { Global, Module } from "@nestjs/common";
import { FileScannerService } from "./file-scanner.service";
import { SecurityCryptoService } from "./security-crypto.service";
import { FileUploadPolicyService } from "./file-upload-policy.service";
import { StorageModule } from "../storage/storage.module";
import { OutboundRequestGateway } from "./outbound-request.gateway";
import { SessionRevocationService } from "./session-revocation.service";

@Global()
@Module({
  imports: [StorageModule],
  providers: [
    FileScannerService,
    SecurityCryptoService,
    FileUploadPolicyService,
    OutboundRequestGateway,
    SessionRevocationService,
  ],
  exports: [
    FileScannerService,
    SecurityCryptoService,
    FileUploadPolicyService,
    OutboundRequestGateway,
    SessionRevocationService,
  ],
})
export class SecurityModule {}
