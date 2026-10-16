import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { PrismaModule } from "./database/prisma/prisma.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { RolesModule } from "./modules/roles/roles.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { HealthModule } from "./health/health.module.js";
import { ConfigModule } from "@nestjs/config";
import { DocumentTypesModule } from "./modules/document-types/document-types.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { BranchesModule } from "./modules/branches/branches.module.js";
import { SuppliersModule } from "./modules/suppliers/suppliers.module.js";
import { CustomersModule } from "./modules/customers/customers.module.js";
import { CategoriesModule } from "./modules/categories/categories.module.js";
import { UnitMeasureModule } from "./modules/unit-measure/unit-measure.module.js";
import { ProductsModule } from "./modules/products/products.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    RolesModule,
    DocumentTypesModule,
    UsersModule,
    BranchesModule,
    SuppliersModule,
    CustomersModule,
    AuditModule,
    HealthModule,
    CategoriesModule,
    UnitMeasureModule,
    ProductsModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
