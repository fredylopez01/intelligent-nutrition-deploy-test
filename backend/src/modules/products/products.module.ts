import { Module } from "@nestjs/common";
import { ProductsService } from "./products.service.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { ProductsController } from "./products.controller.js";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
