import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { PersonsController } from "./persons.controller.js";
import { PersonsService } from "./persons.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [PersonsController],
  providers: [PersonsService],
  exports: [PersonsService],
})
export class PersonsModule {}
