import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { PaymentMethodsController } from "./payment-methods.controller.js";
import { PaymentMethodsService } from "./payment-methods.service.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
