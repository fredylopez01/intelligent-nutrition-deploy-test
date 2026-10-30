import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { GeneralStockController } from "./general-stock.controller.js";
import { GeneralStockService } from "./general-stock.service.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [GeneralStockController],
  providers: [GeneralStockService],
  exports: [GeneralStockService],
})
export class GeneralStockModule {}
