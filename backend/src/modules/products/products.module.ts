import { Module } from "@nestjs/common";
import { ProductsService } from "./products.service.js";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { ProductsController } from "./products.controller.js";
import { StorageModule } from "../storage/storage.module.js";
import { ProductImagesService } from "./images/product-images.service.js";
import { ProductImagesController } from "./images/product-images.controller.js";

@Module({
  imports: [PrismaModule, AuditModule, StorageModule],
  controllers: [ProductsController, ProductImagesController],
  providers: [ProductsService, ProductImagesService],
})
export class ProductsModule {}
