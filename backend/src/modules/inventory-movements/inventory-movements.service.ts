import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateTransferDto } from "./dto/create-transfer.dto.js";
import {
  AdjustmentMovementType,
  CreateAdjustmentDto,
} from "./dto/create-adjustment.dto.js";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto.js";
import {
  CreateMovementDto,
  DirectMovementType,
} from "./dto/create-movement.dto.js";
import { LowStockService } from "../notifications/low-stock.service.js";
import { GeneralStockService } from "../general-stock/general-stock.service.js";
import {
  formatExpirationDate,
  isExpired,
  startOfTodayUtc,
  toExpirationDate,
} from "../../common/utils/expiration.util.js";
import {
  businessDate,
  businessDayBounds,
} from "../../common/utils/business-day.util.js";

type TransactionClient = Prisma.TransactionClient;

interface Lot {
  id: string;
  quantity: number;
  minimumStock: number;
  expirationDate: Date;
}

const MOVEMENT_SELECT = {
  id: true,
  movementType: true,
  quantity: true,
  expirationDate: true,
  movementAt: true,
  observation: true,
  saleId: true,
  purchaseId: true,
  product: {
    select: {
      id: true,
      name: true,
      referenceCode: true,
      unitOfMeasure: { select: { abreviation: true } },
    },
  },
  branch: { select: { id: true, name: true } },
  originBranch: { select: { id: true, name: true } },
  user: {
    select: {
      personId: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.InventoryMovementSelect;

type MovementRow = Prisma.InventoryMovementGetPayload<{
  select: typeof MOVEMENT_SELECT;
}>;

function toMovementResponse(movement: MovementRow) {
  return {
    id: movement.id,
    movementType: movement.movementType,
    quantity: movement.quantity,
    expirationDate: movement.expirationDate
      ? formatExpirationDate(movement.expirationDate)
      : null,
    product: {
      id: movement.product.id,
      name: movement.product.name,
      referenceCode: movement.product.referenceCode,
      unit: movement.product.unitOfMeasure.abreviation,
    },
    branch: movement.branch,
    originBranch: movement.originBranch,
    user: {
      id: movement.user.personId,
      fullName: [movement.user.person.firstName, movement.user.person.lastName]
        .filter(Boolean)
        .join(" "),
    },
    observation: movement.observation,
    saleId: movement.saleId,
    purchaseId: movement.purchaseId,
    movementAt: movement.movementAt,
  };
}

function isScopedRole(currentUser: AuthenticatedUser): boolean {
  const roleName = currentUser.role?.name;
  return roleName === "BRANCH_LEADER" || roleName === "BRANCH_ASSISTANT";
}

function assignedBranchIds(currentUser: AuthenticatedUser): string[] {
  return (currentUser.branches ?? []).map((branch) => branch.id);
}

function scopeViolation(): ForbiddenException {
  return new ForbiddenException({
    code: "BRANCH_SCOPE_VIOLATION",
    message: "You do not have access to this branch.",
  });
}

function insufficientStock(
  available: number,
  requested: number,
  expirationDate: Date | null,
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: "INSUFFICIENT_STOCK",
    message: "The branch does not have enough units of this lot.",
    details: {
      available,
      requested,
      expirationDate: expirationDate
        ? formatExpirationDate(expirationDate)
        : null,
    },
  });
}

@Injectable()
export class InventoryMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly lowStockService: LowStockService,
    private readonly generalStockService: GeneralStockService,
  ) {}

  async createMovement(dto: CreateMovementDto, currentUser: AuthenticatedUser) {
    const { branchId, productId, movementType, quantity } = dto;
    this.assertBranchScope(branchId, currentUser);
    const requestedDate = dto.expirationDate
      ? toExpirationDate(dto.expirationDate)
      : null;

    return this.prisma.$transaction(async (tx) => {
      await this.loadActiveBranch(tx, branchId);
      await this.loadActiveProduct(tx, productId);
      await this.assertOpenDay(tx, branchId);

      const lots = await this.lockLots(tx, branchId, productId);
      if (lots.length === 0) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_ASSIGNED",
          message: "The product is not assigned to this branch.",
        });
      }
      const stockBefore = await this.lowStockService.levels(tx, branchId, [
        productId,
      ]);

      let lotDate: Date;
      if (movementType === DirectMovementType.ENTRY) {
        lotDate = requestedDate ?? (await this.fefoGeneralLot(tx, productId));
        if (isExpired(lotDate)) throw this.lotExpired();
        await this.generalStockService.consume(
          tx,
          productId,
          lotDate,
          quantity,
        );
        await this.increaseLot(
          tx,
          branchId,
          productId,
          lots,
          lotDate,
          quantity,
        );
      } else {
        const lot = this.pickLot(lots, requestedDate, quantity, true);
        lotDate = lot.expirationDate;
        await tx.branchInventory.update({
          where: { id: lot.id },
          data: { quantity: { decrement: quantity } },
        });
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          branchId,
          userId: currentUser.id,
          movementType,
          quantity,
          expirationDate: lotDate,
          observation: dto.observation || null,
        },
        select: MOVEMENT_SELECT,
      });

      await this.lowStockService.notifyCrossings(tx, branchId, stockBefore);

      return {
        ...toMovementResponse(movement),
        resultingQuantity: await this.branchTotal(tx, branchId, productId),
      };
    });
  }

  async createTransfer(dto: CreateTransferDto, currentUser: AuthenticatedUser) {
    const { originBranchId, branchId, productId, quantity } = dto;

    if (originBranchId === branchId) {
      throw new UnprocessableEntityException({
        code: "SAME_BRANCH_TRANSFER",
        message: "Origin and destination branches must be different.",
      });
    }
    this.assertBranchScope(originBranchId, currentUser);
    const requestedDate = dto.expirationDate
      ? toExpirationDate(dto.expirationDate)
      : null;

    return this.prisma.$transaction(async (tx) => {
      await this.loadActiveBranch(tx, originBranchId);
      await this.loadActiveBranch(tx, branchId);
      await this.loadActiveProduct(tx, productId);
      await this.assertOpenDay(tx, originBranchId);
      await this.assertOpenDay(tx, branchId);

      const originLots = await this.lockLots(tx, originBranchId, productId);
      if (originLots.length === 0) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_ASSIGNED",
          message: "The product is not assigned to the origin branch.",
        });
      }
      const destinationLots = await this.lockLots(tx, branchId, productId);
      if (destinationLots.length === 0) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_ASSIGNED_IN_DESTINATION",
          message: "The product is not assigned to the destination branch.",
        });
      }

      const lot = this.pickLot(originLots, requestedDate, quantity, false);
      const stockBefore = await this.lowStockService.levels(
        tx,
        originBranchId,
        [productId],
      );

      await tx.branchInventory.update({
        where: { id: lot.id },
        data: { quantity: { decrement: quantity } },
      });
      await this.increaseLot(
        tx,
        branchId,
        productId,
        destinationLots,
        lot.expirationDate,
        quantity,
      );

      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          branchId,
          originBranchId,
          userId: currentUser.id,
          movementType: "TRANSFER",
          quantity,
          expirationDate: lot.expirationDate,
          observation: dto.observation || null,
        },
        select: MOVEMENT_SELECT,
      });

      await this.lowStockService.notifyCrossings(
        tx,
        originBranchId,
        stockBefore,
      );

      return {
        ...toMovementResponse(movement),
        resultingQuantity: await this.branchTotal(tx, branchId, productId),
        originResultingQuantity: await this.branchTotal(
          tx,
          originBranchId,
          productId,
        ),
      };
    });
  }

  async createAdjustment(
    dto: CreateAdjustmentDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { branchId, productId, movementType, quantity, reason } = dto;
    const requestedDate = dto.expirationDate
      ? toExpirationDate(dto.expirationDate)
      : null;

    return this.prisma.$transaction(async (tx) => {
      await this.loadActiveBranch(tx, branchId);
      await this.loadActiveProduct(tx, productId);
      const closed = await this.isDayClosed(tx, branchId);

      const lots = await this.lockLots(tx, branchId, productId);
      if (lots.length === 0) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_ASSIGNED",
          message: "The product is not assigned to this branch.",
        });
      }
      const stockBefore = await this.lowStockService.levels(tx, branchId, [
        productId,
      ]);

      let lotDate: Date;
      if (movementType === AdjustmentMovementType.ADJUSTMENT_ENTRY) {
        if (requestedDate) {
          lotDate = requestedDate;
        } else {
          const fefo = this.firstSellableLot(lots, false);
          if (!fefo) {
            throw new BadRequestException({
              code: "EXPIRATION_DATE_REQUIRED",
              message:
                "The branch has no current lot of this product: send the expiration date of the lot to adjust.",
            });
          }
          lotDate = fefo.expirationDate;
        }
        await this.increaseLot(
          tx,
          branchId,
          productId,
          lots,
          lotDate,
          quantity,
        );
      } else {
        const lot = this.pickLot(lots, requestedDate, quantity, true);
        lotDate = lot.expirationDate;
        await tx.branchInventory.update({
          where: { id: lot.id },
          data: { quantity: { decrement: quantity } },
        });
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          branchId,
          userId: currentUser.id,
          movementType,
          quantity,
          expirationDate: lotDate,
          observation: reason,
        },
        select: MOVEMENT_SELECT,
      });

      await this.lowStockService.notifyCrossings(tx, branchId, stockBefore);
      const resultingQuantity = await this.branchTotal(tx, branchId, productId);

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: closed ? "POST_CLOSURE_ADJUSTMENT" : "INVENTORY_ADJUSTMENT",
          entity: "INVENTORY_MOVEMENT",
          entityId: movement.id,
          newData: {
            branchId,
            productId,
            movementType,
            quantity,
            expirationDate: formatExpirationDate(lotDate),
            resultingQuantity,
          },
          reason,
          ipAddress,
        },
        tx,
      );

      return { ...toMovementResponse(movement), resultingQuantity };
    });
  }

  async findAll(
    query: ListInventoryMovementsQueryDto,
    currentUser: AuthenticatedUser,
  ) {
    const { page, limit, branchId, productId, movementType, from, to, userId } =
      query;

    if (isScopedRole(currentUser)) {
      if (!branchId) {
        throw new BadRequestException({
          code: "BRANCH_REQUIRED",
          message: "branchId is required for branch roles.",
        });
      }
      if (!assignedBranchIds(currentUser).includes(branchId)) {
        throw scopeViolation();
      }
    }

    const where: Prisma.InventoryMovementWhereInput = {
      ...(movementType
        ? { movementType: movementType as MovementRow["movementType"] }
        : {}),
      ...(productId ? { productId } : {}),
      ...(userId ? { userId } : {}),
      ...(branchId ? { OR: [{ branchId }, { originBranchId: branchId }] } : {}),
      ...(from || to
        ? {
            movementAt: {
              ...(from ? { gte: businessDayBounds(from).start } : {}),
              ...(to ? { lte: businessDayBounds(to).end } : {}),
            },
          }
        : {}),
    };

    const skip = (page - 1) * limit;
    const [total, movements] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ movementAt: "desc" }, { id: "desc" }],
        select: MOVEMENT_SELECT,
      }),
    ]);

    return {
      data: movements.map(toMovementResponse),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(movementId: string, currentUser: AuthenticatedUser) {
    const movement = await this.prisma.inventoryMovement.findUnique({
      where: { id: movementId },
      select: MOVEMENT_SELECT,
    });

    if (!movement) {
      throw new NotFoundException({
        code: "MOVEMENT_NOT_FOUND",
        message: "Inventory movement not found.",
      });
    }

    if (isScopedRole(currentUser)) {
      const userBranchIds = assignedBranchIds(currentUser);
      const involved = [movement.branch?.id, movement.originBranch?.id];
      if (!involved.some((id) => id && userBranchIds.includes(id))) {
        throw scopeViolation();
      }
    }

    return toMovementResponse(movement);
  }

  private assertBranchScope(branchId: string, currentUser: AuthenticatedUser) {
    if (!isScopedRole(currentUser)) return;
    if (!assignedBranchIds(currentUser).includes(branchId)) {
      throw scopeViolation();
    }
  }

  private async loadActiveBranch(tx: TransactionClient, branchId: string) {
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, active: true },
    });
    if (!branch) {
      throw new NotFoundException({
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found.",
        details: { branchId },
      });
    }
    if (!branch.active) {
      throw new UnprocessableEntityException({
        code: "BRANCH_INACTIVE",
        message: "Branch is inactive.",
        details: { branchId },
      });
    }
    return branch;
  }

  private async loadActiveProduct(tx: TransactionClient, productId: string) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, active: true },
    });
    if (!product) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found.",
      });
    }
    if (!product.active) {
      throw new UnprocessableEntityException({
        code: "PRODUCT_INACTIVE",
        message: "Product is inactive.",
      });
    }
    return product;
  }

  private async isDayClosed(
    tx: TransactionClient,
    branchId: string,
  ): Promise<boolean> {
    const closure = await tx.inventoryClosure.findUnique({
      where: {
        branchId_closureDate: { branchId, closureDate: businessDate() },
      },
      select: { status: true, locked: true },
    });
    return !!closure && (closure.status === "CONFIRMED" || closure.locked);
  }

  private async assertOpenDay(tx: TransactionClient, branchId: string) {
    if (await this.isDayClosed(tx, branchId)) {
      throw new UnprocessableEntityException({
        code: "INVENTORY_CLOSED",
        message: "The inventory of this branch is already closed for today.",
        details: { branchId },
      });
    }
  }

  private async lockLots(
    tx: TransactionClient,
    branchId: string,
    productId: string,
  ): Promise<Lot[]> {
    await tx.$queryRaw`
      SELECT id FROM branch_inventory
      WHERE branch_id = ${branchId}::uuid
        AND product_id = ${productId}::uuid
      FOR UPDATE
    `;
    return tx.branchInventory.findMany({
      where: { branchId, productId },
      orderBy: { expirationDate: "asc" },
      select: {
        id: true,
        quantity: true,
        minimumStock: true,
        expirationDate: true,
      },
    });
  }

  private firstSellableLot(lots: Lot[], withStock: boolean): Lot | undefined {
    const today = startOfTodayUtc().getTime();
    return lots.find(
      (lot) =>
        lot.expirationDate.getTime() >= today &&
        (!withStock || lot.quantity > 0),
    );
  }

  private pickLot(
    lots: Lot[],
    requestedDate: Date | null,
    quantity: number,
    allowExpired: boolean,
  ): Lot {
    if (requestedDate) {
      const lot = lots.find(
        (item) => item.expirationDate.getTime() === requestedDate.getTime(),
      );
      if (!lot) {
        throw new NotFoundException({
          code: "LOT_NOT_FOUND",
          message:
            "The branch has no lot of this product with that expiration date.",
          details: { expirationDate: formatExpirationDate(requestedDate) },
        });
      }
      if (!allowExpired && isExpired(lot.expirationDate))
        throw this.lotExpired();
      if (lot.quantity < quantity) {
        throw insufficientStock(lot.quantity, quantity, lot.expirationDate);
      }
      return lot;
    }

    const lot = this.firstSellableLot(lots, true);
    if (!lot) throw insufficientStock(0, quantity, null);
    if (lot.quantity < quantity) {
      throw insufficientStock(lot.quantity, quantity, lot.expirationDate);
    }
    return lot;
  }

  private async increaseLot(
    tx: TransactionClient,
    branchId: string,
    productId: string,
    lots: Lot[],
    expirationDate: Date,
    quantity: number,
  ) {
    const existing = lots.find(
      (lot) => lot.expirationDate.getTime() === expirationDate.getTime(),
    );
    if (existing) {
      await tx.branchInventory.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } },
      });
      return;
    }
    await tx.branchInventory.create({
      data: {
        branchId,
        productId,
        expirationDate,
        quantity,
        minimumStock: Math.max(0, ...lots.map((lot) => lot.minimumStock)),
      },
    });
  }

  private async fefoGeneralLot(
    tx: TransactionClient,
    productId: string,
  ): Promise<Date> {
    const lot = await tx.generalStock.findFirst({
      where: {
        productId,
        quantity: { gt: 0 },
        expirationDate: { gte: startOfTodayUtc() },
      },
      orderBy: { expirationDate: "asc" },
      select: { expirationDate: true },
    });
    if (!lot) {
      throw new UnprocessableEntityException({
        code: "INSUFFICIENT_GENERAL_STOCK",
        message: "The general stock has no current units of this product.",
        details: { productId, available: 0 },
      });
    }
    return lot.expirationDate;
  }

  private async branchTotal(
    tx: TransactionClient,
    branchId: string,
    productId: string,
  ): Promise<number> {
    const result = await tx.branchInventory.aggregate({
      where: { branchId, productId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  private lotExpired(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: "LOT_EXPIRED",
      message: "The lot is expired: it can only leave the branch as an exit.",
    });
  }
}
