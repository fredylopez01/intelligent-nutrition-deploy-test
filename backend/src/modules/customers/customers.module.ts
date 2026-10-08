import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PersonsModule } from "../persons/persons.module.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";

@Module({
  imports: [PrismaModule, PersonsModule, AuditModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}