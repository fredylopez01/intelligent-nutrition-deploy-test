import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";
import { EmailModule } from "../../modules/email/email.module.js";

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
