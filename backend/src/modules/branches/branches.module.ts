import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { BranchesController } from "./branches.controller.js";
import { BranchesService } from "./branches.service.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BranchesController],
  providers: [BranchesService],
})
export class BranchesModule {}
