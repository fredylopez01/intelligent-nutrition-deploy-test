import { Module } from "@nestjs/common";
import { InventoryClosuresService } from "./inventory-closures.service.js";
import { InventoryClosuresController } from "./inventory-closures.controller.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [InventoryClosuresController],
  providers: [InventoryClosuresService],
})
export class InventoryClosuresModule {}
