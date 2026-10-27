import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import {
  formatExpirationDate,
  isExpired,
} from "../../common/utils/expiration.util.js";
import { AuditService } from "../audit/audit.service.js";
import {
  RestockGeneralStockDto,
  RestockMovementType,
} from "./dto/restock-general-stock.dto.js";

type TransactionClient = Prisma.TransactionClient;

interface GeneralStockProduct {
  id: string;
  name: string;
  referenceCode: string;
  active: boolean;
  unitOfMeasure: { abreviation: string };
}

interface GeneralStockLot {
  id: string;
  quantity: number;
  expirationDate: Date;
}

// The restock contract does not send an expiration date and general stock is
// stored by lot. When the product has no current lot, the adjusted units live
// in a dedicated far-future lot so the total can still be represented.
function restockExpirationDate(): Date {
  return new Date(Date.UTC(9999, 11, 31));
}

function toGeneralStockResponse(
  product: GeneralStockProduct,
  lots: GeneralStockLot[],
) {
  const formattedLots = lots.map((lot) => ({
    id: lot.id,
    expirationDate: formatExpirationDate(lot.expirationDate),
    quantity: lot.quantity,
    expired: isExpired(lot.expirationDate),
  }));
  return {
    product: {
      id: product.id,
      name: product.name,
      referenceCode: product.referenceCode,
      active: product.active,
      unitOfMeasure: { abbreviation: product.unitOfMeasure.abreviation },
    },
    totalQuantity: formattedLots.reduce((sum, lot) => sum + lot.quantity, 0),
    lots: formattedLots,
  };
}

@Injectable()
export class GeneralStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async increase(
    tx: TransactionClient,
    productId: string,
    expirationDate: Date,
    quantity: number,
  ) {
    return tx.generalStock.upsert({
      where: { productId_expirationDate: { productId, expirationDate } },
      create: { productId, expirationDate, quantity },
      update: { quantity: { increment: quantity } },
    });
  }

  async consume(
    tx: TransactionClient,
    productId: string,
    expirationDate: Date,
    quantity: number,
  ) {
    await tx.$queryRaw`
      SELECT id FROM general_stock
      WHERE product_id = ${productId}::uuid
        AND expiration_date = ${expirationDate}
      FOR UPDATE
    `;
    const lot = await tx.generalStock.findUnique({
      where: { productId_expirationDate: { productId, expirationDate } },
      select: { id: true, quantity: true },
    });
    const available = lot?.quantity ?? 0;
    if (!lot || available < quantity) {
      throw new UnprocessableEntityException({
        code: "INSUFFICIENT_GENERAL_STOCK",
        message: "The general stock does not have enough units of this lot.",
        details: {
          productId,
          expirationDate: formatExpirationDate(expirationDate),
          requested: quantity,
          available,
        },
      });
    }
    return tx.generalStock.update({
      where: { id: lot.id },
      data: { quantity: { decrement: quantity } },
    });
  }

  async findByProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        referenceCode: true,
        active: true,
        unitOfMeasure: { select: { abreviation: true } },
        generalStock: {
          where: { quantity: { gt: 0 } },
          orderBy: { expirationDate: "asc" },
          select: { id: true, quantity: true, expirationDate: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found",
      });
    }
    return toGeneralStockResponse(product, product.generalStock);
  }

  async restock(
    productId: string,
    dto: RestockGeneralStockDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { movementType, quantity, reason } = dto;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException({
        code: "INVALID_QUANTITY",
        message: "quantity must be an integer greater than 0.",
        details: { quantity },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          active: true,
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
          message: "Product is inactive.",
          details: { productId },
        });
      }

      await tx.$queryRaw`
        SELECT id FROM general_stock
        WHERE product_id = ${productId}::uuid
        FOR UPDATE
      `;
      const lots = await tx.generalStock.findMany({
        where: { productId },
        orderBy: { expirationDate: "asc" },
        select: { id: true, quantity: true, expirationDate: true },
      });
      const available = lots.reduce((sum, lot) => sum + lot.quantity, 0);

      let movementExpirationDate: Date | null;
      if (movementType === RestockMovementType.ADJUSTMENT_ENTRY) {
        movementExpirationDate = await this.increaseGeneralStock(
          tx,
          productId,
          lots,
          quantity,
        );
      } else {
        movementExpirationDate = await this.decreaseGeneralStock(
          tx,
          productId,
          lots,
          quantity,
          available,
        );
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          branchId: null,
          originBranchId: null,
          userId: currentUser.id,
          movementType,
          quantity,
          expirationDate: movementExpirationDate,
          observation: reason,
        },
        select: { id: true },
      });

      const updatedLots = await tx.generalStock.findMany({
        where: { productId, quantity: { gt: 0 } },
        orderBy: { expirationDate: "asc" },
        select: { id: true, quantity: true, expirationDate: true },
      });
      const stock = toGeneralStockResponse(product, updatedLots);

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "RESTOCK",
          entity: "INVENTORY_MOVEMENT",
          entityId: movement.id,
          newData: {
            productId,
            movementType,
            quantity,
            reason,
            previousQuantity: available,
            resultingQuantity: stock.totalQuantity,
          },
          reason,
          ipAddress,
        },
        tx,
      );

      return stock;
    });
  }

  private async increaseGeneralStock(
    tx: TransactionClient,
    productId: string,
    lots: GeneralStockLot[],
    quantity: number,
  ): Promise<Date> {
    const lot = lots.find((item) => !isExpired(item.expirationDate));
    if (lot) {
      await tx.generalStock.update({
        where: { id: lot.id },
        data: { quantity: { increment: quantity } },
      });
      return lot.expirationDate;
    }

    const expirationDate = restockExpirationDate();
    await tx.generalStock.upsert({
      where: { productId_expirationDate: { productId, expirationDate } },
      create: { productId, expirationDate, quantity },
      update: { quantity: { increment: quantity } },
    });
    return expirationDate;
  }

  private async decreaseGeneralStock(
    tx: TransactionClient,
    productId: string,
    lots: GeneralStockLot[],
    quantity: number,
    available: number,
  ): Promise<Date | null> {
    if (available < quantity) {
      throw new UnprocessableEntityException({
        code: "INSUFFICIENT_GENERAL_STOCK",
        message:
          "The general stock does not have enough units of this product.",
        details: { productId, requested: quantity, available },
      });
    }

    let remaining = quantity;
    const affectedDates: Date[] = [];
    for (const lot of lots) {
      if (remaining === 0) break;
      if (lot.quantity <= 0) continue;

      const taken = Math.min(remaining, lot.quantity);
      await tx.generalStock.update({
        where: { id: lot.id },
        data: { quantity: { decrement: taken } },
      });
      remaining -= taken;
      affectedDates.push(lot.expirationDate);
    }

    return affectedDates.length === 1 ? affectedDates[0] : null;
  }
}
