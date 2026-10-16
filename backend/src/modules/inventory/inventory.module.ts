import { Module } from "@nestjs/common";
import { InventoryService } from "./inventory.service.js";
import { InventoryController } from "./inventory.controller.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { InventoryGlobalController } from "./inventory-global.controller.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [InventoryController, InventoryGlobalController],
  providers: [InventoryService],
})
export class InventoryModule {}
