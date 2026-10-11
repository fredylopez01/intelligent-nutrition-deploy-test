import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";
import { ListCategoriesQueryDto } from "./dto/list-categories-query.dto.js";

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

  async findAll(query: ListCategoriesQueryDto) {
    const { page, limit, active, search, sortBy, sortOrder } = query;

    if (search !== undefined && search.length < 2) {
      throw new BadRequestException({
        code: "SEARCH_TOO_SHORT",
        message: "Search must contain at least 2 characters.",
        details: { minLength: 2 },
      });
    }

    const where = {
      ...(active === undefined ? {} : { active }),
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [total, categories] = await this.prisma.$transaction([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          description: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      data: categories,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(categoryId: string) {
    const categoy = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!categoy) {
      throw new NotFoundException("Category not found");
    }

    return categoy;
  }
}
