import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";
import { EmailModule } from "../email/email.module.js";

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
