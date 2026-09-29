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
    AuditModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
