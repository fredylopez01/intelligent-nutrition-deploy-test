import { Module } from "@nestjs/common";
import { InventoryMovementsService } from "./inventory-movements.service.js";
import { InventoryMovementsController } from "./inventory-movements.controller.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { GeneralStockModule } from "../general-stock/general-stock.module.js";

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule, GeneralStockModule],
  controllers: [InventoryMovementsController],
  providers: [InventoryMovementsService],
})
export class InventoryMovementsModule {}
