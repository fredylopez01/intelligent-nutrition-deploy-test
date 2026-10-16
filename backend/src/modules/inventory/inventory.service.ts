import {
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

      const inventory = await transaction.branchInventory.create({
        data: {
          branchId,
          productId: dto.productId,
          quantity: dto.quantity,
          minimumStock: dto.minimumStock,
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
          minimumStock: inventory.minimumStock,
          lowStock: inventory.quantity < inventory.minimumStock,
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

    const productWhere: Prisma.ProductWhereInput = {
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

    const where: Prisma.BranchInventoryWhereInput = {
      branchId,
      ...(Object.keys(productWhere).length ? { product: productWhere } : {}),
    };

    const skip = (page - 1) * limit;

    let idFilter: string[] | undefined;
    if (lowStock === true || lowStock === false) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
        lowStock
          ? Prisma.sql`SELECT id FROM branch_inventory WHERE branch_id = ${branchId}::uuid AND quantity < minimum_stock`
          : Prisma.sql`SELECT id FROM branch_inventory WHERE branch_id = ${branchId}::uuid AND quantity >= minimum_stock`,
      );
      idFilter = rows.map((r) => r.id);
      if (idFilter.length === 0) {
        return {
          data: [],
          meta: { page, limit, total: 0, totalPages: 0 },
        };
      }
    }

    const finalWhere: Prisma.BranchInventoryWhereInput = {
      ...where,
      ...(idFilter ? { id: { in: idFilter } } : {}),
    };

    const orderBy = this.buildOrderBy(sortBy, sortOrder);

    const [total, inventories] = await this.prisma.$transaction([
      this.prisma.branchInventory.count({ where: finalWhere }),
      this.prisma.branchInventory.findMany({
        where: finalWhere,
        skip,
        take: limit,
        orderBy,
        select: this.inventorySelect(),
      }),
    ]);

    const roleName = currentUser.role?.name;
    const canSeeStockThresholds =
      roleName === "SUPERADMIN" || roleName === "BRANCH_LEADER";

    return {
      data: inventories.map((inv) =>
        this.toInventoryResponse(inv, canSeeStockThresholds),
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

    const inventory = await this.prisma.branchInventory.findFirst({
      where: { branchId, productId },
      select: this.inventorySelect(),
    });

    if (!inventory) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_IN_BRANCH_INVENTORY",
        message: "Product not found in this branch inventory",
      });
    }

    const roleName = currentUser.role?.name;
    const canSeeStockThresholds =
      roleName === "SUPERADMIN" || roleName === "BRANCH_LEADER";

    return {
      data: this.toInventoryResponse(inventory, canSeeStockThresholds),
    };
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

  private buildOrderBy(
    sortBy: BranchInventorySortBy,
    sortOrder: SortOrder,
  ): Prisma.BranchInventoryOrderByWithRelationInput {
    switch (sortBy) {
      case BranchInventorySortBy.NAME:
        return { product: { name: sortOrder } };
      case BranchInventorySortBy.REFERENCE_CODE:
        return { product: { referenceCode: sortOrder } };
      case BranchInventorySortBy.QUANTITY:
        return { quantity: sortOrder };
      default:
        return { product: { name: "asc" } };
    }
  }

  private toInventoryResponse(
    inv: {
      id: string;
      branchId: string;
      productId: string;
      quantity: number;
      minimumStock: number;
      expirationDate: Date;
      updatedAt: Date;
      product: {
        id: string;
        name: string;
        referenceCode: string;
        active: boolean;
        price: Prisma.Decimal;
        category: { id: string; name: string };
        unitOfMeasure: { abreviation: string };
      };
    },
    includeThresholds: boolean,
  ) {
    return {
      id: inv.id,
      branchId: inv.branchId,
      product: {
        id: inv.product.id,
        name: inv.product.name,
        referenceCode: inv.product.referenceCode,
        category: inv.product.category,
        unitOfMeasure: { abbreviation: inv.product.unitOfMeasure.abreviation },
        price: inv.product.price.toFixed(2),
        active: inv.product.active,
      },
      quantity: inv.quantity,
      expirationDate: inv.expirationDate,
      updatedAt: inv.updatedAt,
      ...(includeThresholds
        ? {
            minimumStock: inv.minimumStock,
            lowStock: inv.quantity < inv.minimumStock,
          }
        : {}),
    };
  }
}
