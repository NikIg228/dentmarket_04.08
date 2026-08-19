import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { ImportFileParser } from "./import-file.parser";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [AccessControlModule, SuppliersModule, SearchModule],
  controllers: [ImportsController],
  providers: [ImportFileParser, ImportsService],
})
export class ImportsModule {}
