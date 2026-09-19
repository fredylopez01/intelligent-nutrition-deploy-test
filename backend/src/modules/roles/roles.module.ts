import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller.js";
import { RolesService } from "./roles.service.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
