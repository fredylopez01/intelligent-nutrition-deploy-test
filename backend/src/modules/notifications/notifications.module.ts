import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { LowStockService } from "./low-stock.service.js";
import { NotificationWriterService } from "./notification-writer.service.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationWriterService, LowStockService, NotificationsService],
  exports: [NotificationWriterService, LowStockService],
})
export class NotificationsModule {}
