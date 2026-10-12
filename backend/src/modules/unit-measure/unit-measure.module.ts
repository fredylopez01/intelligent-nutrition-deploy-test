import { Module } from "@nestjs/common";
import { UnitMeasureService } from "./unit-measure.service.js";
import { UnitMeasureController } from "./unit-measure.controller.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [UnitMeasureController],
  providers: [UnitMeasureService],
})
export class UnitMeasureModule {}
