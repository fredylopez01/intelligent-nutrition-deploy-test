import { Module } from "@nestjs/common";
import { PurchasesService } from "./purchases.service.js";
import { PurchasesController } from "./purchases.controller.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { GeneralStockModule } from "../general-stock/general-stock.module.js";

@Module({
  imports: [PrismaModule, AuditModule, GeneralStockModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
