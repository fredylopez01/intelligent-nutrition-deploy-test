import { Injectable } from "@nestjs/common";
import {
  NotificationWriterService,
  type TransactionClient,
} from "./notification-writer.service.js";

export interface StockLevel {
  total: number;
  minimum: number;
}

export type StockLevels = Map<string, StockLevel>;

function isLow(level: StockLevel): boolean {
  return level.total < level.minimum;
}

@Injectable()
export class LowStockService {
  constructor(private readonly writer: NotificationWriterService) {}

  async levels(
    tx: TransactionClient,
    branchId: string,
    productIds: string[],
  ): Promise<StockLevels> {
    const ids = [...new Set(productIds)];
    if (ids.length === 0) return new Map();
    const rows = await tx.branchInventory.groupBy({
      by: ["productId"],
      where: { branchId, productId: { in: ids } },
      _sum: { quantity: true },
      _max: { minimumStock: true },
    });
    return new Map(
      rows.map((row) => [
        row.productId,
        { total: row._sum.quantity ?? 0, minimum: row._max.minimumStock ?? 0 },
      ]),
    );
  }

  async notifyCrossings(
    tx: TransactionClient,
    branchId: string,
    before: StockLevels,
  ): Promise<number> {
    const after = await this.levels(tx, branchId, [...before.keys()]);
    const crossed = [...after.entries()].filter(([productId, now]) => {
      const previous = before.get(productId);
      return previous !== undefined && isLow(now) && !isLow(previous);
    });
    if (crossed.length === 0) return 0;

    const [recipients, branch, products] = await Promise.all([
      this.writer.branchManagerIds(tx, branchId),
      tx.branch.findUnique({ where: { id: branchId }, select: { name: true } }),
      tx.product.findMany({
        where: { id: { in: crossed.map(([productId]) => productId) } },
        select: { id: true, name: true },
      }),
    ]);
    const names = new Map(
      products.map((product) => [product.id, product.name]),
    );

    let created = 0;
    for (const [productId, level] of crossed) {
      created += await this.writer.createForUsers(tx, recipients, {
        type: "LOW_STOCK",
        title: "Inventario bajo",
        message: `${names.get(productId) ?? "Un producto"} está por debajo del mínimo en ${branch?.name ?? "la sede"} (${level.total} de ${level.minimum}).`,
        branchId,
        productId,
      });
    }
    return created;
  }
}
