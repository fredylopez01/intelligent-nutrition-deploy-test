import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { SuppliersController } from "./suppliers.controller.js";
import { SuppliersService } from "./suppliers.service.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
})
export class SuppliersModule {}
