import { Module } from "@nestjs/common";
import { CategoriesService } from "./categories.service.js";
import { CategoriesController } from "./categories.controller.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
