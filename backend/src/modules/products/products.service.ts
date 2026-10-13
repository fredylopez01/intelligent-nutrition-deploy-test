import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { Prisma } from "../../../generated/prisma/client.js";

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const {
      name,
      referenceCode,
      description,
      categoryId,
      unitOfMeasureId,
      price,
    } = createProductDto;

    const existingProduct = await this.prisma.product.findFirst({
      where: {
        referenceCode: {
          equals: referenceCode,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existingProduct) {
      throw new ConflictException({
        code: "PRODUCT_REFERENCE_CODE_ALREADY_EXISTS",
        message: "Product with this reference code already exists",
      });
    }

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, active: true },
    });

    if (!category) {
      throw new NotFoundException({
        code: "CATEGORY_NOT_FOUND",
        message: "Category not found",
      });
    }

    if (!category.active) {
      throw new UnprocessableEntityException({
        code: "CATEGORY_INACTIVE",
        message: "Category is inactive",
      });
    }

    const unit = await this.prisma.unitMeasure.findUnique({
      where: { id: unitOfMeasureId },
      select: { id: true, name: true, active: true },
    });

    if (!unit) {
      throw new NotFoundException({
        code: "UNIT_NOT_FOUND",
        message: "Unit of measure not found",
      });
    }

    if (!unit.active) {
      throw new UnprocessableEntityException({
        code: "UNIT_INACTIVE",
        message: "Unit of measure is inactive",
      });
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const product = await transaction.product.create({
          data: {
            name,
            referenceCode,
            description: description ?? null,
            categoryId,
            unitOfMeasureId,
            price: new Prisma.Decimal(price),
          },
        });

        await this.auditService.createAuditLog(
          {
            userId: currentUser.id,
            action: "CREATE",
            entity: "PRODUCT",
            entityId: product.id,
            newData: {
              ...product,
              price: product.price.toString(),
            },
            reason: `Creación del producto ${product.name} (${product.referenceCode})`,
            ipAddress,
          },
          transaction,
        );

        return {
          id: product.id,
          name: product.name,
          referenceCode: product.referenceCode,
          description: product.description,
          categoryId: product.categoryId,
          unitOfMeasureId: product.unitOfMeasureId,
          price: product.price.toFixed(2),
          active: product.active,
          primaryImageUrl: null,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        };
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        throw new ConflictException({
          code: "PRODUCT_REFERENCE_CODE_ALREADY_EXISTS",
          message: "Product with this reference code already exists",
        });
      }
      throw error;
    }
  }
}
