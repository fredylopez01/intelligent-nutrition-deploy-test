import { Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma/prisma.module.js";
import { DocumentTypesController } from "./document-types.controller.js";
import { DocumentTypesService } from "./document-types.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [DocumentTypesController],
  providers: [DocumentTypesService],
})
export class DocumentTypesModule {}
