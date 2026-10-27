import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { LowStockService } from "./low-stock.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "8f5c2d0e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";
const wheyId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const creatineId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const tx = {
  branchInventory: { groupBy: jest.fn<AsyncMock>() },
  branch: { findUnique: jest.fn<AsyncMock>() },
  product: { findMany: jest.fn<AsyncMock>() },
};

const writer = {
  branchManagerIds: jest.fn<AsyncMock>(),
  createForUsers: jest.fn<AsyncMock>(),
};

function grouped(rows: Array<[string, number, number]>) {
  return rows.map(([productId, total, minimum]) => ({
    productId,
    _sum: { quantity: total },
    _max: { minimumStock: minimum },
  }));
}

describe("LowStockService", () => {
  let service: LowStockService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new LowStockService(writer as never);
    tx.branch.findUnique.mockResolvedValue({ name: "Centro" });
    tx.product.findMany.mockResolvedValue([
      { id: wheyId, name: "Whey Protein 2 lb" },
      { id: creatineId, name: "Creatina 300 g" },
    ]);
    writer.branchManagerIds.mockResolvedValue(["leader-id", "admin-id"]);
    writer.createForUsers.mockImplementation((_tx, userIds) =>
      Promise.resolve((userIds as string[]).length),
    );
  });

  it("reads the total of every lot and the minimum of each product in the branch", async () => {
    tx.branchInventory.groupBy.mockResolvedValue(grouped([[wheyId, 35, 8]]));

    const levels = await service.levels(tx as never, branchId, [
      wheyId,
      wheyId,
    ]);

    expect(levels.get(wheyId)).toEqual({ total: 35, minimum: 8 });
    expect(tx.branchInventory.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId, productId: { in: [wheyId] } },
      }),
    );
  });

  it("does not query anything when there are no products", async () => {
    await expect(service.levels(tx as never, branchId, [])).resolves.toEqual(
      new Map(),
    );
    expect(tx.branchInventory.groupBy).not.toHaveBeenCalled();
  });

  it("notifies the branch leaders and superadmins when a product drops under its minimum", async () => {
    tx.branchInventory.groupBy.mockResolvedValue(grouped([[wheyId, 3, 5]]));
    const before = new Map([[wheyId, { total: 6, minimum: 5 }]]);

    const created = await service.notifyCrossings(
      tx as never,
      branchId,
      before,
    );

    expect(created).toBe(2);
    expect(writer.branchManagerIds).toHaveBeenCalledWith(tx, branchId);
    expect(writer.createForUsers).toHaveBeenCalledWith(
      tx,
      ["leader-id", "admin-id"],
      {
        type: "LOW_STOCK",
        title: "Inventario bajo",
        message:
          "Whey Protein 2 lb está por debajo del mínimo en Centro (3 de 5).",
        branchId,
        productId: wheyId,
      },
    );
  });

  it("does not repeat the alert while the product stays under the minimum", async () => {
    tx.branchInventory.groupBy.mockResolvedValue(grouped([[wheyId, 2, 5]]));
    const before = new Map([[wheyId, { total: 3, minimum: 5 }]]);

    await expect(
      service.notifyCrossings(tx as never, branchId, before),
    ).resolves.toBe(0);
    expect(writer.createForUsers).not.toHaveBeenCalled();
  });

  it("ignores products without a minimum and products that stay at the minimum", async () => {
    tx.branchInventory.groupBy.mockResolvedValue(
      grouped([
        [wheyId, 0, 0],
        [creatineId, 5, 5],
      ]),
    );
    const before = new Map([
      [wheyId, { total: 4, minimum: 0 }],
      [creatineId, { total: 9, minimum: 5 }],
    ]);

    await expect(
      service.notifyCrossings(tx as never, branchId, before),
    ).resolves.toBe(0);
  });

  it("alerts when raising the minimum leaves the product under it", async () => {
    tx.branchInventory.groupBy.mockResolvedValue(
      grouped([[creatineId, 14, 20]]),
    );
    const before = new Map([[creatineId, { total: 14, minimum: 6 }]]);

    await service.notifyCrossings(tx as never, branchId, before);

    expect(writer.createForUsers).toHaveBeenCalledWith(
      tx,
      ["leader-id", "admin-id"],
      expect.objectContaining({
        message:
          "Creatina 300 g está por debajo del mínimo en Centro (14 de 20).",
      }),
    );
  });
});
