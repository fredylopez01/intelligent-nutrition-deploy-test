import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AssignProductDto } from "./dto/assign-product.dto.js";
import {
  BranchInventorySortBy,
  ListBranchInventoryQueryDto,
  SortOrder,
} from "./dto/list-branch-inventory-query.dto.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { UpdateMinimumStockDto } from "./dto/update-minimunstock.dto.js";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async assignProductToBranch(
    branchId: string,
    dto: AssignProductDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    this.assertBranchScope(branchId, currentUser);

    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true, active: true },
      });
      if (!branch) {
        throw new NotFoundException({
          code: "BRANCH_NOT_FOUND",
          message: "Branch not found",
        });
      }
      if (!branch.active) {
        throw new UnprocessableEntityException({
          code: "BRANCH_INACTIVE",
          message: "Branch is inactive",
        });
      }

      const product = await transaction.product.findUnique({
        where: { id: dto.productId },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          active: true,
          price: true,
          category: { select: { id: true, name: true } },
          unitOfMeasure: { select: { abreviation: true } },
        },
      });
      if (!product) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found",
        });
      }
      if (!product.active) {
        throw new UnprocessableEntityException({
          code: "PRODUCT_INACTIVE",
          message: "Product is inactive",
        });
      }

      await transaction.$queryRaw`SELECT id FROM product WHERE id = ${dto.productId} FOR UPDATE`;

      const expirationDate = new Date(dto.expirationDate);
      const existingInventory = await transaction.branchInventory.findUnique({
        where: {
          branchId_productId_expirationDate: {
            branchId,
            productId: dto.productId,
            expirationDate,
          },
        },
        select: { id: true },
      });
      if (existingInventory) {
        throw new ConflictException({
          code: "PRODUCT_ALREADY_ASSIGNED",
          message:
            "Product is already assigned to this branch with the same expiration date",
        });
      }

      const existingLot = await transaction.branchInventory.findFirst({
        where: { branchId, productId: dto.productId },
        select: { minimumStock: true },
        orderBy: { expirationDate: "asc" },
      });

      const effectiveMinimumStock =
        existingLot !== null ? existingLot.minimumStock : dto.minimumStock;

      const inventory = await transaction.branchInventory.create({
        data: {
          branchId,
          productId: dto.productId,
          quantity: dto.quantity,
          minimumStock: effectiveMinimumStock,
          expirationDate,
        },
      });

      if (dto.quantity > 0) {
        await transaction.inventoryMovement.create({
          data: {
            productId: dto.productId,
            branchId,
            originBranchId: null,
            userId: currentUser.id,
            movementType: "TRANSFER",
            quantity: dto.quantity,
            observation:
              dto.observation ?? "Initial assignment from general stock",
          },
        });
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "ASSIGN",
          entity: "branch_inventory",
          entityId: inventory.id,
          newData: {
            ...inventory,
            expirationDate: inventory.expirationDate.toISOString(),
          },
          reason: "Product assigned to branch",
          ipAddress,
        },
        transaction,
      );

      const allLots = await transaction.branchInventory.findMany({
        where: { branchId, productId: dto.productId },
        select: { quantity: true, minimumStock: true },
      });
      const totalQuantity = allLots.reduce((s, l) => s + l.quantity, 0);

      return {
        data: {
          id: inventory.id,
          branchId: inventory.branchId,
          product: {
            id: product.id,
            name: product.name,
            referenceCode: product.referenceCode,
            category: product.category,
            unitOfMeasure: { abbreviation: product.unitOfMeasure.abreviation },
            price: product.price.toFixed(2),
            active: product.active,
          },
          quantity: inventory.quantity,
          minimumStock: effectiveMinimumStock,
          lowStock: totalQuantity < effectiveMinimumStock,
          expirationDate: inventory.expirationDate,
          updatedAt: inventory.updatedAt,
        },
      };
    });
  }

  private assertBranchScope(branchId: string, currentUser: AuthenticatedUser) {
    const roleName = currentUser.role?.name;
    if (roleName === "SUPERADMIN") return;

    if (roleName === "BRANCH_LEADER") {
      const branches = currentUser.branches ?? [];
      const hasAccess = branches.some((b) => b.id === branchId);
      if (!hasAccess) {
        throw new ForbiddenException({
          code: "BRANCH_OUT_OF_SCOPE",
          message: "You do not have access to this branch",
        });
      }
      return;
    }

    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
  }

  async findAllByBranch(
    branchId: string,
    query: ListBranchInventoryQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    this.assertBranchScope(branchId, currentUser);

    const {
      page,
      limit,
      search,
      categoryId,
      lowStock,
      productActive,
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

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found",
      });
    }

    const grouped = await this.prisma.branchInventory.groupBy({
      by: ["productId"],
      where: { branchId },
      _sum: { quantity: true },
      _max: { minimumStock: true },
    });

    if (grouped.length === 0) {
      return {
        data: [],
        meta: { page, limit, total: 0, totalPages: 0 },
      };
    }

    const productWhere: Prisma.ProductWhereInput = {
      id: { in: grouped.map((g) => g.productId) },
      ...(productActive === undefined ? {} : { active: productActive }),
      ...(categoryId ? { categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { referenceCode: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const products = await this.prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        name: true,
        referenceCode: true,
        active: true,
        price: true,
        category: { select: { id: true, name: true } },
        unitOfMeasure: { select: { abreviation: true } },
      },
    });

    const merged = products.map((p) => {
      const g = grouped.find((x) => x.productId === p.id)!;
      const totalQuantity = g._sum.quantity ?? 0;
      const minimumStock = g._max.minimumStock ?? 0;
      return {
        product: p,
        totalQuantity,
        minimumStock,
        lowStock: totalQuantity < minimumStock,
      };
    });

    const filtered =
      lowStock === undefined
        ? merged
        : merged.filter((m) => m.lowStock === lowStock);

    filtered.sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case BranchInventorySortBy.QUANTITY:
          return (a.totalQuantity - b.totalQuantity) * dir;
        case BranchInventorySortBy.REFERENCE_CODE:
          return (
            a.product.referenceCode.localeCompare(b.product.referenceCode) * dir
          );
        case BranchInventorySortBy.NAME:
        default:
          return a.product.name.localeCompare(b.product.name) * dir;
      }
    });

    const total = filtered.length;
    const skip = (page - 1) * limit;
    const pageItems = filtered.slice(skip, skip + limit);

    const roleName = currentUser.role?.name;
    const canSeeStockThresholds =
      roleName === "SUPERADMIN" || roleName === "BRANCH_LEADER";

    return {
      data: pageItems.map((item) =>
        this.toGroupedInventoryResponse(item, canSeeStockThresholds),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOneByBranchAndProduct(
    branchId: string,
    productId: string,
    currentUser: AuthenticatedUser,
  ) {
    this.assertBranchScope(branchId, currentUser);

    const lots = await this.prisma.branchInventory.findMany({
      where: { branchId, productId },
      orderBy: { expirationDate: "asc" },
      select: this.inventorySelect(),
    });

    if (lots.length === 0) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_ASSIGNED",
        message: "Product not assigned to this branch",
      });
    }

    const roleName = currentUser.role?.name;
    const canSeeStockThresholds =
      roleName === "SUPERADMIN" || roleName === "BRANCH_LEADER";

    const first = lots[0];
    const totalQuantity = lots.reduce((s, l) => s + l.quantity, 0);
    const minimumStock = first.minimumStock;

    return {
      data: {
        branchId,
        product: {
          id: first.product.id,
          name: first.product.name,
          referenceCode: first.product.referenceCode,
          category: first.product.category,
          unitOfMeasure: {
            abbreviation: first.product.unitOfMeasure.abreviation,
          },
          price: first.product.price.toFixed(2),
          active: first.product.active,
        },
        totalQuantity,
        ...(canSeeStockThresholds
          ? {
              minimumStock,
              lowStock: totalQuantity < minimumStock,
            }
          : {}),
        lots: lots.map((lot) => ({
          id: lot.id,
          quantity: lot.quantity,
          expirationDate: lot.expirationDate,
          updatedAt: lot.updatedAt,
        })),
      },
    };
  }

  async updateMinimumStock(
    branchId: string,
    productId: string,
    dto: UpdateMinimumStockDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    this.assertBranchScope(branchId, currentUser);

    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true, active: true },
      });
      if (!branch) {
        throw new NotFoundException({
          code: "BRANCH_NOT_FOUND",
          message: "Branch not found",
        });
      }
      if (!branch.active) {
        throw new UnprocessableEntityException({
          code: "BRANCH_INACTIVE",
          message: "Branch is inactive",
        });
      }

      const existingLots = await transaction.branchInventory.findMany({
        where: { branchId, productId },
        select: {
          id: true,
          quantity: true,
          minimumStock: true,
          expirationDate: true,
          updatedAt: true,
        },
        orderBy: { expirationDate: "asc" },
      });

      if (existingLots.length === 0) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_ASSIGNED",
          message: "Product not assigned to this branch",
        });
      }

      const previousMinimumStock = existingLots[0].minimumStock;
      const totalQuantity = existingLots.reduce((s, l) => s + l.quantity, 0);
      const previousLowStock = totalQuantity < previousMinimumStock;

      const hasChanged = previousMinimumStock !== dto.minimumStock;

      let updatedAt: Date;
      if (hasChanged) {
        await transaction.branchInventory.updateMany({
          where: { branchId, productId },
          data: { minimumStock: dto.minimumStock },
        });

        await this.auditService.createAuditLog(
          {
            userId: currentUser.id,
            action: "UPDATE",
            entity: "branch_inventory",
            entityId: productId,
            oldData: {
              branchId,
              productId,
              minimumStock: previousMinimumStock,
              totalQuantity,
              lowStock: previousLowStock,
            },
            newData: {
              branchId,
              productId,
              minimumStock: dto.minimumStock,
              totalQuantity,
              lowStock: totalQuantity < dto.minimumStock,
            },
            reason: `Minimum stock updated to ${dto.minimumStock} for product in branch`,
            ipAddress,
          },
          transaction,
        );

        const refreshed = await transaction.branchInventory.findFirstOrThrow({
          where: { branchId, productId },
          select: { updatedAt: true },
          orderBy: { updatedAt: "desc" },
        });
        updatedAt = refreshed.updatedAt;
      } else {
        updatedAt = existingLots[0].updatedAt;
      }

      return {
        data: {
          branchId,
          productId,
          minimumStock: dto.minimumStock,
          totalQuantity,
          lowStock: totalQuantity < dto.minimumStock,
          lotsUpdated: hasChanged ? existingLots.length : 0,
          lots: existingLots.map((l) => ({
            id: l.id,
            quantity: l.quantity,
            expirationDate: l.expirationDate,
          })),
          updatedAt,
        },
      };
    });
  }

  private inventorySelect() {
    return {
      id: true,
      branchId: true,
      productId: true,
      quantity: true,
      minimumStock: true,
      expirationDate: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          referenceCode: true,
          active: true,
          price: true,
          category: { select: { id: true, name: true } },
          unitOfMeasure: { select: { abreviation: true } },
        },
      },
    } as const;
  }

  private toGroupedInventoryResponse(
    item: {
      product: {
        id: string;
        name: string;
        referenceCode: string;
        active: boolean;
        price: Prisma.Decimal;
        category: { id: string; name: string };
        unitOfMeasure: { abreviation: string };
      };
      totalQuantity: number;
      minimumStock: number;
      lowStock: boolean;
    },
    includeThresholds: boolean,
  ) {
    return {
      product: {
        id: item.product.id,
        name: item.product.name,
        referenceCode: item.product.referenceCode,
        category: item.product.category,
        unitOfMeasure: {
          abbreviation: item.product.unitOfMeasure.abreviation,
        },
        price: item.product.price.toFixed(2),
        active: item.product.active,
      },
      totalQuantity: item.totalQuantity,
      ...(includeThresholds
        ? {
            minimumStock: item.minimumStock,
            lowStock: item.lowStock,
          }
        : {}),
    };
  }
}
