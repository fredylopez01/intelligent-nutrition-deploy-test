import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { CreateDocumentTypeDto } from "./dto/create-document-type.dto.js";
import { UpdateDocumentTypeDto } from "./dto/update-document-type.dto.js";

@Injectable()
export class DocumentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentTypeDto: CreateDocumentTypeDto) {
    const code = createDocumentTypeDto.code.trim();
    const name = createDocumentTypeDto.name.trim();
    const existingType = await this.prisma.documentType.findUnique({
      where: { code },
    });

    if (existingType) {
      throw new ConflictException("Document type code already exists");
    }

    return this.prisma.documentType.create({
      data: { code, name },
    });
  }

  async findAll(active?: boolean) {
    return this.prisma.documentType.findMany({
      where: active === undefined ? {} : { active },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const documentType = await this.prisma.documentType.findUnique({
      where: { id },
    });

    if (!documentType) {
      throw new NotFoundException("Document type not found");
    }

    return documentType;
  }

  async update(id: string, updateDocumentTypeDto: UpdateDocumentTypeDto) {
    const existingType = await this.findOne(id);
    const { code, name } = updateDocumentTypeDto;

    if (code === undefined && name === undefined) {
      throw new BadRequestException("At least one field must be provided");
    }

    const normalizedCode = code?.trim();
    if (normalizedCode && normalizedCode !== existingType.code) {
      const typeWithSameCode = await this.prisma.documentType.findUnique({
        where: { code: normalizedCode },
      });

      if (typeWithSameCode) {
        throw new ConflictException("Document type code already exists");
      }
    }

    return this.prisma.documentType.update({
      where: { id },
      data: {
        ...(code !== undefined && { code: normalizedCode }),
        ...(name !== undefined && { name: name.trim() }),
      },
    });
  }

  async updateStatus(id: string, active: boolean) {
    await this.findOne(id);

    return this.prisma.documentType.update({
      where: { id },
      data: { active },
    });
  }
}
