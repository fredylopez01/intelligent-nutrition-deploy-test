import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { name, description } = createCategoryDto;

    const existingCategory = await this.prisma.category.findUnique({
      where: { name },
    });

    if (existingCategory) {
      throw new ConflictException({
        code: "CATEGORY_NAME_ALREADY_EXISTS",
        message: "Category with this name already exists",
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const category = await this.prisma.category.create({
        data: {
          name,
          description,
        },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "CATEGORY",
          entityId: category.id,
          newData: category,
          reason: `Creación de la categoria ${category.name}`,
          ipAddress,
        },
        transaction,
      );

      return category;
    });
  }
}
