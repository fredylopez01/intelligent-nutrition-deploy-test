import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import {
  formatExpirationDate,
  isExpired,
} from "../../common/utils/expiration.util.js";

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class GeneralStockService {
  constructor(private readonly prisma: PrismaService) {}

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
    const lots = product.generalStock.map((lot) => ({
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
      totalQuantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
      lots,
    };
  }
}
