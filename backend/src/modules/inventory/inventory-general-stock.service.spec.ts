import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { InventoryService } from "./inventory.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "8f5c2d0e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";
const productId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const admin: AuthenticatedUser = {
  id: "admin-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

const tx = {
  branch: { findUnique: jest.fn<AsyncMock>() },
  product: { findUnique: jest.fn<AsyncMock>() },
  $queryRaw: jest.fn<AsyncMock>(),
  branchInventory: {
    findUnique: jest.fn<AsyncMock>(),
    findFirst: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    updateMany: jest.fn<AsyncMock>(),
    findFirstOrThrow: jest.fn<AsyncMock>(),
  },
  inventoryMovement: { create: jest.fn<AsyncMock>() },
};
const prisma = {
  $transaction:
    jest.fn<
      (operation: (client: typeof tx) => Promise<unknown>) => Promise<unknown>
    >(),
};
const audit = { createAuditLog: jest.fn<AsyncMock>() };
const generalStock = { consume: jest.fn<AsyncMock>() };
const lowStock = {
  levels: jest.fn<AsyncMock>(),
  notifyCrossings: jest.fn<AsyncMock>(),
};

const assignDto = (
  quantity: number,
  expirationDate = "2027-01-31T00:00:00Z",
) => ({
  productId,
  quantity,
  minimumStock: 5,
  expirationDate,
});

describe("InventoryService with general stock and low stock alerts", () => {
  let service: InventoryService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-25T15:00:00.000Z") });
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.branch.findUnique.mockResolvedValue({
      id: branchId,
      name: "Centro",
      active: true,
    });
    tx.product.findUnique.mockResolvedValue({
      id: productId,
      name: "Whey Protein 2 lb",
      referenceCode: "WHEY",
      active: true,
      price: { toFixed: () => "145000.00" },
      category: { id: "cat", name: "Proteínas" },
      unitOfMeasure: { abreviation: "und" },
    });
    tx.branchInventory.findUnique.mockResolvedValue(null);
    tx.branchInventory.findFirst.mockResolvedValue(null);
    tx.branchInventory.create.mockResolvedValue({
      id: "lot-id",
      branchId,
      productId,
      quantity: 20,
      minimumStock: 5,
      expirationDate: new Date("2027-01-31T00:00:00.000Z"),
      updatedAt: new Date(),
    });
    tx.branchInventory.findMany.mockResolvedValue([
      { quantity: 20, minimumStock: 5 },
    ]);
    service = new InventoryService(
      prisma as never,
      audit as never,
      generalStock as never,
      lowStock as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("takes the assigned units from the general stock lot with the same expiration date", async () => {
    await service.assignProductToBranch(branchId, assignDto(20), admin);

    expect(generalStock.consume).toHaveBeenCalledWith(
      tx,
      productId,
      new Date("2027-01-31T00:00:00.000Z"),
      20,
    );
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: "TRANSFER",
        originBranchId: null,
        quantity: 20,
        expirationDate: new Date("2027-01-31T00:00:00.000Z"),
      }),
    });
  });

  it("does not touch the general stock when the lot starts empty", async () => {
    await service.assignProductToBranch(branchId, assignDto(0), admin);

    expect(generalStock.consume).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("does not create the lot when the general stock cannot cover it", async () => {
    generalStock.consume.mockRejectedValue(
      new Error("INSUFFICIENT_GENERAL_STOCK"),
    );

    await expect(
      service.assignProductToBranch(branchId, assignDto(20) as never, admin),
    ).rejects.toThrow("INSUFFICIENT_GENERAL_STOCK");
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("rejects an expired lot", async () => {
    await expect(
      service.assignProductToBranch(
        branchId,
        assignDto(5, "2026-10-24T00:00:00Z") as never,
        admin,
      ),
    ).rejects.toMatchObject({ response: { code: "LOT_EXPIRED" } });
    expect(tx.branchInventory.create).not.toHaveBeenCalled();
  });

  it("evaluates the low stock alert when the minimum changes", async () => {
    const before = new Map([[productId, { total: 14, minimum: 6 }]]);
    lowStock.levels.mockResolvedValue(before);
    tx.branchInventory.findMany.mockResolvedValue([
      {
        id: "lot-id",
        quantity: 14,
        minimumStock: 6,
        expirationDate: new Date("2027-01-31T00:00:00.000Z"),
        updatedAt: new Date(),
      },
    ]);
    tx.branchInventory.findFirstOrThrow.mockResolvedValue({
      updatedAt: new Date(),
    });

    await service.updateMinimumStock(
      branchId,
      productId,
      { minimumStock: 20 },
      admin,
    );

    expect(lowStock.levels).toHaveBeenCalledWith(tx, branchId, [productId]);
    expect(lowStock.notifyCrossings).toHaveBeenCalledWith(tx, branchId, before);
  });

  it("does not evaluate alerts when the minimum stays the same", async () => {
    tx.branchInventory.findMany.mockResolvedValue([
      {
        id: "lot-id",
        quantity: 14,
        minimumStock: 6,
        expirationDate: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await service.updateMinimumStock(
      branchId,
      productId,
      { minimumStock: 6 },
      admin,
    );

    expect(lowStock.notifyCrossings).not.toHaveBeenCalled();
  });
});
