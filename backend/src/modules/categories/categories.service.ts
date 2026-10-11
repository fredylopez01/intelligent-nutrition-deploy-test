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
import { UpdateCategoryDto } from "./dto/update-category.dto.js";

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
      const category = await transaction.category.create({
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

  async update(
    categoryId: string,
    updateCategoryDto: UpdateCategoryDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    if (
      Object.values(updateCategoryDto).every((value) => value === undefined)
    ) {
      throw new BadRequestException("At least one field must be provided");
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingCategory = await transaction.category.findUnique({
          where: { id: categoryId },
        });

        if (!existingCategory) {
          throw new NotFoundException("Category not found");
        }

        const { name, description } = updateCategoryDto;
        if (name !== undefined && name !== existingCategory.name) {
          const categoryWithSameName = await transaction.category.findUnique({
            where: { name },
            select: { id: true },
          });

          if (categoryWithSameName) {
            throw new ConflictException("Category name already exists");
          }
        }

        const updatedCategory = await transaction.category.update({
          where: { id: categoryId },
          data: {
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
          },
          select: {
            id: true,
            name: true,
            description: true,
            active: true,
          },
        });

        if (
          existingCategory.name !== updatedCategory.name &&
          existingCategory.description !== updateCategoryDto.description
        ) {
          await this.auditService.createAuditLog(
            {
              userId: currentUser.id,
              action: "UPDATE",
              entity: "CATEGORY",
              entityId: categoryId,
              oldData: existingCategory,
              newData: updatedCategory,
              reason: `Actualización de la categoria ${updatedCategory.name}`,
              ipAddress,
            },
            transaction,
          );
        }

        return updatedCategory;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Category name already exists");
      }

      throw error;
    }
  }

  async updateStatus(
    categoryId: string,
    active: boolean,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return await this.prisma.$transaction(async (transaction) => {
      const existingCategory = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true, description: true, active: true },
      });
      if (!existingCategory) {
        throw new NotFoundException("Category not found");
      }
      if (existingCategory.active === active) {
        throw new ConflictException({
          code: "ALREADY_IN_STATE",
          message: "Category is already in the requested state.",
        });
      }

      await transaction.category.update({
        where: { id: categoryId, active: existingCategory.active },
        data: { active },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: active ? "ACTIVATE" : "DEACTIVATE",
          entity: "CUSTOMER",
          entityId: categoryId,
          oldData: { active: existingCategory.active },
          newData: { active },
          reason: `${active ? "Activación" : "Desactivación"} de la categoria ${existingCategory.name}`,
          ipAddress,
        },
        transaction,
      );

      return { message: "Category status updated successfully." };
    });
  }
}
