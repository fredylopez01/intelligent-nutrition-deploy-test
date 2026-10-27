import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { SalesService } from "./sales.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "8f5c2d0e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";
const productId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const paymentMethodId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const saleId = "9e8d7c6b-5a49-4382-9716-a5b4c3d2e1f0";

const leader: AuthenticatedUser = {
  id: "leader-id",
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: branchId, name: "Centro" }],
};

const storedSale = {
  id: saleId,
  saleNumber: "V-20261025-0001",
  status: "COMPLETED",
  saleAt: new Date("2026-10-25T15:00:00.000Z"),
  subtotal: "30000.00",
  discountAmount: "0.00",
  taxAmount: "0.00",
  total: "30000.00",
  reversalReason: null,
  reversedAt: null,
  branch: { id: branchId, name: "Centro" },
  user: {
    personId: "leader-id",
    person: { firstName: "Laura", lastName: "Pérez" },
  },
  customer: null,
  details: [],
  payments: [],
};

const tx = {
  branch: { findUnique: jest.fn<AsyncMock>() },
  inventoryClosure: { findUnique: jest.fn<AsyncMock>() },
  product: { findMany: jest.fn<AsyncMock>() },
  paymentMethod: { findMany: jest.fn<AsyncMock>() },
  $queryRaw: jest.fn<AsyncMock>(),
  branchInventory: {
    findMany: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
  sale: {
    findFirst: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    findUnique: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  inventoryMovement: {
    create: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
  },
};

const prisma = {
  $transaction:
    jest.fn<
      (operation: (client: typeof tx) => Promise<unknown>) => Promise<unknown>
    >(),
};
const audit = { createAuditLog: jest.fn<AsyncMock>() };
const lowStock = {
  levels: jest.fn<AsyncMock>(),
  notifyCrossings: jest.fn<AsyncMock>(),
};

const lot = (id: string, quantity: number, expiration: string) => ({
  id,
  quantity,
  minimumStock: 5,
  expirationDate: new Date(`${expiration}T00:00:00.000Z`),
});

function saleDto(quantity: number) {
  return {
    branchId,
    customerId: null,
    items: [{ productId, quantity }],
    payments: [{ paymentMethodId, amount: (quantity * 10000).toFixed(2) }],
  };
}

describe("SalesService lots", () => {
  let service: SalesService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-25T15:00:00.000Z") });
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.branch.findUnique.mockResolvedValue({
      id: branchId,
      name: "Centro",
      active: true,
    });
    tx.inventoryClosure.findUnique.mockResolvedValue(null);
    tx.product.findMany.mockResolvedValue([
      {
        id: productId,
        name: "Whey Protein 2 lb",
        referenceCode: "WHEY",
        price: "10000.00",
        active: true,
      },
    ]);
    tx.paymentMethod.findMany.mockResolvedValue([
      { id: paymentMethodId, code: "CASH", name: "Efectivo", active: true },
    ]);
    tx.sale.findFirst.mockResolvedValue(null);
    tx.sale.create.mockResolvedValue(storedSale);
    tx.sale.findUnique.mockResolvedValue(storedSale);
    lowStock.levels.mockResolvedValue(new Map());
    service = new SalesService(
      prisma as never,
      audit as never,
      lowStock as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("only offers lots that are not expired, from the closest expiration", async () => {
    tx.branchInventory.findMany.mockResolvedValue([
      lot("lot-a", 2, "2026-11-01"),
    ]);

    await service.create(saleDto(1), leader);

    expect(tx.branchInventory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId,
          productId,
          expirationDate: { gte: new Date("2026-10-25T00:00:00.000Z") },
        },
        orderBy: { expirationDate: "asc" },
      }),
    );
  });

  it("takes the units FEFO across lots and records one EXIT per lot", async () => {
    tx.branchInventory.findMany.mockResolvedValue([
      lot("lot-a", 2, "2026-11-01"),
      lot("lot-b", 10, "2027-03-01"),
    ]);

    await service.create(saleDto(3), leader);

    expect(tx.branchInventory.update).toHaveBeenNthCalledWith(1, {
      where: { id: "lot-a" },
      data: { quantity: { decrement: 2 } },
    });
    expect(tx.branchInventory.update).toHaveBeenNthCalledWith(2, {
      where: { id: "lot-b" },
      data: { quantity: { decrement: 1 } },
    });
    const movements = tx.inventoryMovement.create.mock.calls.map(
      ([arg]) => (arg as { data: Record<string, unknown> }).data,
    );
    expect(movements).toEqual([
      expect.objectContaining({
        movementType: "EXIT",
        quantity: 2,
        expirationDate: new Date("2026-11-01T00:00:00.000Z"),
        saleId,
      }),
      expect.objectContaining({
        movementType: "EXIT",
        quantity: 1,
        expirationDate: new Date("2027-03-01T00:00:00.000Z"),
        saleId,
      }),
    ]);
  });

  it("answers INSUFFICIENT_STOCK when only expired units would cover the sale", async () => {
    tx.branchInventory.findMany.mockResolvedValue([
      lot("lot-a", 1, "2026-11-01"),
    ]);

    await expect(
      service.create(saleDto(3) as never, leader),
    ).rejects.toMatchObject({
      response: {
        code: "INSUFFICIENT_STOCK",
        details: {
          items: [expect.objectContaining({ requested: 3, available: 1 })],
        },
      },
    });
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("evaluates the low stock alert with the levels taken before the sale", async () => {
    const before = new Map([[productId, { total: 6, minimum: 5 }]]);
    lowStock.levels.mockResolvedValue(before);
    tx.branchInventory.findMany.mockResolvedValue([
      lot("lot-a", 6, "2026-11-01"),
    ]);

    await service.create(saleDto(2), leader);

    expect(lowStock.levels).toHaveBeenCalledWith(tx, branchId, [productId]);
    expect(lowStock.notifyCrossings).toHaveBeenCalledWith(tx, branchId, before);
  });

  it("returns every unit of a reversal to the lot it was sold from", async () => {
    tx.sale.findUnique
      .mockResolvedValueOnce({
        id: saleId,
        saleNumber: "V-20261025-0001",
        status: "COMPLETED",
        branchId,
        saleAt: new Date("2026-10-25T14:00:00.000Z"),
        total: "30000.00",
        details: [{ id: "detail-1", productId, quantity: 3 }],
      })
      .mockResolvedValue(storedSale);
    tx.inventoryMovement.findMany.mockResolvedValue([
      {
        productId,
        quantity: 2,
        expirationDate: new Date("2026-11-01T00:00:00.000Z"),
      },
      {
        productId,
        quantity: 1,
        expirationDate: new Date("2027-03-01T00:00:00.000Z"),
      },
    ]);
    tx.branchInventory.findMany.mockResolvedValue([
      lot("lot-a", 0, "2026-11-01"),
      lot("lot-b", 9, "2027-03-01"),
    ]);

    await service.reverse(
      saleId,
      { reason: "Producto entregado equivocado" },
      leader,
    );

    expect(tx.branchInventory.update).toHaveBeenCalledWith({
      where: { id: "lot-a" },
      data: { quantity: { increment: 2 } },
    });
    expect(tx.branchInventory.update).toHaveBeenCalledWith({
      where: { id: "lot-b" },
      data: { quantity: { increment: 1 } },
    });
    const entries = tx.inventoryMovement.create.mock.calls.map(
      ([arg]) => (arg as { data: Record<string, unknown> }).data,
    );
    expect(entries).toEqual([
      expect.objectContaining({ movementType: "ENTRY", quantity: 2, saleId }),
      expect.objectContaining({ movementType: "ENTRY", quantity: 1, saleId }),
    ]);
  });

  it("recreates the original lot when it no longer exists in the branch", async () => {
    tx.sale.findUnique
      .mockResolvedValueOnce({
        id: saleId,
        saleNumber: "V-20261025-0001",
        status: "COMPLETED",
        branchId,
        saleAt: new Date("2026-10-25T14:00:00.000Z"),
        total: "10000.00",
        details: [{ id: "detail-1", productId, quantity: 1 }],
      })
      .mockResolvedValue(storedSale);
    tx.inventoryMovement.findMany.mockResolvedValue([
      {
        productId,
        quantity: 1,
        expirationDate: new Date("2026-11-01T00:00:00.000Z"),
      },
    ]);
    tx.branchInventory.findMany.mockResolvedValue([
      lot("lot-b", 9, "2027-03-01"),
    ]);

    await service.reverse(
      saleId,
      { reason: "Producto entregado equivocado" },
      leader,
    );

    expect(tx.branchInventory.create).toHaveBeenCalledWith({
      data: {
        branchId,
        productId,
        quantity: 1,
        minimumStock: 5,
        expirationDate: new Date("2026-11-01T00:00:00.000Z"),
      },
    });
  });
});
