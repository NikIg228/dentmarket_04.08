import { Global, Module } from "@nestjs/common";
import { FileScannerService } from "./file-scanner.service";
import { SecurityCryptoService } from "./security-crypto.service";
import { FileUploadPolicyService } from "./file-upload-policy.service";
import { StorageModule } from "../storage/storage.module";
import { OutboundRequestGateway } from "./outbound-request.gateway";

@Global()
@Module({
  imports: [StorageModule],
  providers: [
    FileScannerService,
    SecurityCryptoService,
    FileUploadPolicyService,
    OutboundRequestGateway,
  ],
  exports: [
    FileScannerService,
    SecurityCryptoService,
    FileUploadPolicyService,
    OutboundRequestGateway,
  ],
})
export class SecurityModule {}
