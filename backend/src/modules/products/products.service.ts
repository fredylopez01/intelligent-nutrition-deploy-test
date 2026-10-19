import {
  BadRequestException,
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
import { ListProductsQueryDto } from "./dto/list-products-query.dto.js";
import { UpdateProductDto } from "./dto/update-product.dto.js";

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

  async findAll(query: ListProductsQueryDto) {
    const {
      page,
      limit,
      search,
      categoryId,
      unitOfMeasureId,
      active,
      sortBy,
      sortOrder,
    } = query;

    if (search !== undefined && search.length < 2) {
      throw new BadRequestException({
        code: "SEARCH_TOO_SHORT",
        message: "Search must contain at least 2 characters.",
        details: { minLength: 2 },
      });
    }

    const where: Prisma.ProductWhereInput = {
      ...(active === undefined ? {} : { active }),
      ...(categoryId ? { categoryId } : {}),
      ...(unitOfMeasureId ? { unitOfMeasureId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { referenceCode: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          description: true,
          price: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: { id: true, name: true },
          },
          unitOfMeasure: {
            select: { id: true, name: true, abreviation: true },
          },
          images: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
        },
      }),
    ]);

    return {
      data: products.map((product) => this.toListItem(product)),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        referenceCode: true,
        description: true,
        price: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: { id: true, name: true },
        },
        unitOfMeasure: {
          select: { id: true, name: true, abreviation: true },
        },
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: {
            id: true,
            url: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            isPrimary: true,
            sortOrder: true,
            createdAt: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found",
      });
    }

    return {
      data: {
        id: product.id,
        name: product.name,
        referenceCode: product.referenceCode,
        description: product.description,
        category: product.category,
        unitOfMeasure: {
          id: product.unitOfMeasure.id,
          name: product.unitOfMeasure.name,
          abbreviation: product.unitOfMeasure.abreviation,
        },
        price: product.price.toFixed(2),
        active: product.active,
        images: product.images.map((img) => ({
          id: img.id,
          url: img.url,
          fileName: img.fileName,
          mimeType: img.mimeType,
          sizeBytes: img.sizeBytes,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
          createdAt: img.createdAt,
        })),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
    };
  }

  async update(
    productId: string,
    updateProductDto: UpdateProductDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    if (updateProductDto.referenceCode !== undefined) {
      throw new BadRequestException({
        code: "FIELD_NOT_EDITABLE",
        message: "referenceCode is not editable once the product is created",
        details: { field: "referenceCode" },
      });
    }

    const editableFields = [
      updateProductDto.name,
      updateProductDto.description,
      updateProductDto.categoryId,
      updateProductDto.unitOfMeasureId,
      updateProductDto.price,
    ];
    if (editableFields.every((v) => v === undefined)) {
      throw new BadRequestException({
        code: "NO_FIELDS_TO_UPDATE",
        message: "At least one editable field must be provided",
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const existingProduct = await transaction.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          description: true,
          categoryId: true,
          unitOfMeasureId: true,
          price: true,
        },
      });

      if (!existingProduct) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found",
        });
      }

      if (updateProductDto.categoryId !== undefined) {
        const category = await transaction.category.findUnique({
          where: { id: updateProductDto.categoryId },
          select: { id: true, active: true },
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
      }

      if (updateProductDto.unitOfMeasureId !== undefined) {
        const unit = await transaction.unitMeasure.findUnique({
          where: { id: updateProductDto.unitOfMeasureId },
          select: { id: true, active: true },
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
      }

      const oldData = {
        name: existingProduct.name,
        description: existingProduct.description,
        categoryId: existingProduct.categoryId,
        unitOfMeasureId: existingProduct.unitOfMeasureId,
        price: existingProduct.price.toFixed(2),
      };

      const newData = {
        name: updateProductDto.name ?? existingProduct.name,
        description:
          updateProductDto.description !== undefined
            ? updateProductDto.description
            : existingProduct.description,
        categoryId: updateProductDto.categoryId ?? existingProduct.categoryId,
        unitOfMeasureId:
          updateProductDto.unitOfMeasureId ?? existingProduct.unitOfMeasureId,
        price:
          updateProductDto.price !== undefined
            ? new Prisma.Decimal(updateProductDto.price).toFixed(2)
            : existingProduct.price.toFixed(2),
      };

      const changed = {
        name: oldData.name !== newData.name,
        description: oldData.description !== newData.description,
        categoryId: oldData.categoryId !== newData.categoryId,
        unitOfMeasureId: oldData.unitOfMeasureId !== newData.unitOfMeasureId,
        price: oldData.price !== newData.price,
      };

      const anyChange = Object.values(changed).some(Boolean);

      if (anyChange) {
        const data: Prisma.ProductUpdateInput = {};
        if (changed.name) data.name = newData.name;
        if (changed.description) data.description = newData.description;
        if (changed.categoryId)
          data.category = { connect: { id: newData.categoryId } };
        if (changed.unitOfMeasureId)
          data.unitOfMeasure = { connect: { id: newData.unitOfMeasureId } };
        if (changed.price) data.price = new Prisma.Decimal(newData.price);

        await transaction.product.update({
          where: { id: productId },
          data,
        });

        const oldDelta: Record<string, unknown> = {};
        const newDelta: Record<string, unknown> = {};
        for (const key of Object.keys(changed) as Array<keyof typeof changed>) {
          if (changed[key]) {
            oldDelta[key] = oldData[key];
            newDelta[key] = newData[key];
          }
        }

        const reason = changed.price
          ? "Product price updated"
          : `Actualización del producto ${newData.name}`;

        await this.auditService.createAuditLog(
          {
            userId: currentUser.id,
            action: "UPDATE",
            entity: "PRODUCT",
            entityId: productId,
            oldData: oldDelta,
            newData: newDelta,
            reason,
            ipAddress,
          },
          transaction,
        );
      }

      const finalProduct = await transaction.product.findUniqueOrThrow({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          description: true,
          categoryId: true,
          unitOfMeasureId: true,
          price: true,
          active: true,
          updatedAt: true,
          images: {
            where: { isPrimary: true },
            select: { url: true },
            take: 1,
          },
        },
      });

      return {
        id: finalProduct.id,
        name: finalProduct.name,
        referenceCode: finalProduct.referenceCode,
        description: finalProduct.description,
        categoryId: finalProduct.categoryId,
        unitOfMeasureId: finalProduct.unitOfMeasureId,
        price: finalProduct.price.toFixed(2),
        active: finalProduct.active,
        primaryImageUrl: finalProduct.images[0]?.url ?? null,
        updatedAt: finalProduct.updatedAt,
      };
    });
  }

  async updateStatus(
    productId: string,
    active: boolean,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existingProduct = await transaction.product.findUnique({
        where: { id: productId },
        select: { id: true, name: true, referenceCode: true, active: true },
      });

      if (!existingProduct) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found",
        });
      }

      if (existingProduct.active === active) {
        throw new ConflictException({
          code: "ALREADY_IN_STATE",
          message: "Product is already in the requested state.",
        });
      }

      await transaction.product.update({
        where: { id: productId },
        data: { active },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: active ? "ACTIVATE" : "DEACTIVATE",
          entity: "PRODUCT",
          entityId: productId,
          oldData: { active: existingProduct.active },
          newData: { active },
          reason: `${active ? "Activación" : "Desactivación"} del producto ${existingProduct.name} (${existingProduct.referenceCode})`,
          ipAddress,
        },
        transaction,
      );

      return { message: "Product status updated successfully." };
    });
  }

  private toListItem(product: {
    id: string;
    name: string;
    referenceCode: string;
    description: string | null;
    price: Prisma.Decimal;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; name: string };
    unitOfMeasure: { id: string; name: string; abreviation: string };
    images: { url: string }[];
  }) {
    return {
      id: product.id,
      name: product.name,
      referenceCode: product.referenceCode,
      description: product.description,
      category: product.category,
      unitOfMeasure: {
        id: product.unitOfMeasure.id,
        name: product.unitOfMeasure.name,
        abbreviation: product.unitOfMeasure.abreviation,
      },
      price: product.price.toFixed(2),
      active: product.active,
      primaryImageUrl: product.images[0]?.url ?? null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
