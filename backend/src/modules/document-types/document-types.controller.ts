import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CreateDocumentTypeDto } from "./dto/create-document-type.dto.js";
import { ListDocumentTypesQueryDto } from "./dto/list-document-types-query.dto.js";
import { UpdateDocumentTypeStatusDto } from "./dto/update-document-type-status.dto.js";
import { UpdateDocumentTypeDto } from "./dto/update-document-type.dto.js";
import { DocumentTypesService } from "./document-types.service.js";

@Controller("document-types")
export class DocumentTypesController {
  constructor(private readonly documentTypesService: DocumentTypesService) {}

  @Post()
  @Roles("DEV")
  create(@Body() createDocumentTypeDto: CreateDocumentTypeDto) {
    return this.documentTypesService.create(createDocumentTypeDto);
  }

  @Get()
  findAll(@Query() query: ListDocumentTypesQueryDto) {
    return this.documentTypesService.findAll(query.active);
  }

  @Patch(":id")
  @Roles("DEV")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() updateDocumentTypeDto: UpdateDocumentTypeDto,
  ) {
    return this.documentTypesService.update(id, updateDocumentTypeDto);
  }

  @Patch(":id/status")
  @Roles("DEV")
  updateStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() updateStatusDto: UpdateDocumentTypeStatusDto,
  ) {
    return this.documentTypesService.updateStatus(id, updateStatusDto.active);
  }
}
