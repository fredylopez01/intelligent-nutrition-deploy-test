import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { NightlyJobsService } from "./nightly-jobs.service.js";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [NightlyJobsService],
  exports: [NightlyJobsService],
})
export class NightlyJobsModule {}
