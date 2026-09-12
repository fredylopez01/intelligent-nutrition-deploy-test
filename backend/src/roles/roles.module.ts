import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { PrismaModule } from "src/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
