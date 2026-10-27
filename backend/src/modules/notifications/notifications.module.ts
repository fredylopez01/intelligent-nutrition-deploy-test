import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { LowStockService } from "./low-stock.service.js";
import { NotificationWriterService } from "./notification-writer.service.js";

@Module({
  imports: [PrismaModule],
  providers: [NotificationWriterService, LowStockService],
  exports: [NotificationWriterService, LowStockService],
})
export class NotificationsModule {}
