import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { SalesController } from "./sales.controller.js";
import { SalesService } from "./sales.service.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
