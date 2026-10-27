import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { PurchasesService } from "./purchases.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const purchaseId = "9e8d7c6b-5a49-4382-9716-a5b4c3d2e1f0";
const detailId = "4d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a";
const productId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

const admin: AuthenticatedUser = {
  id: "admin-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

function purchase(receivedQuantity = 0) {
  return {
    id: purchaseId,
    purchaseNumber: "C-20261025-0001",
    status: "PENDING_RECEIPT",
    supplierId: "supplier-id",
    subtotal: "4900000.00",
    total: "4900000.00",
    observation: null,
    purchaseAt: new Date("2026-10-20T15:00:00.000Z"),
    createdAt: new Date("2026-10-20T15:00:00.000Z"),
    updatedAt: new Date("2026-10-20T15:00:00.000Z"),
    details: [
      {
        id: detailId,
        productId,
        requestedQuantity: 50,
        receivedQuantity,
        unitPrice: "98000.00",
        subtotal: "4900000.00",
        received: false,
        observation: null,
        product: {
          id: productId,
          name: "Whey Protein 2 lb",
          referenceCode: "WHEY",
        },
      },
    ],
    supplier: {
      personId: "supplier-id",
      commercialName: "Suplementos",
      person: { businessName: "Suplementos SAS" },
    },
    user: {
      personId: "admin-id",
      person: { firstName: "Laura", lastName: "Pérez" },
    },
  };
}

const tx = {
  purchase: { findUnique: jest.fn<AsyncMock>(), update: jest.fn<AsyncMock>() },
  purchaseDetail: {
    update: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
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
const generalStock = { increase: jest.fn<AsyncMock>() };

describe("PurchasesService receipts by lot", () => {
  let service: PurchasesService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-25T15:00:00.000Z") });
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.purchase.findUnique.mockResolvedValue(purchase());
    tx.purchaseDetail.findMany.mockResolvedValue([
      { receivedQuantity: 48, requestedQuantity: 50 },
    ]);
    service = new PurchasesService(
      prisma as never,
      audit as never,
      generalStock as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("adds every received lot to the general stock and records it in the movements", async () => {
    await service.receive(
      purchaseId,
      {
        items: [
          {
            purchaseDetailId: detailId,
            receivedQuantity: 30,
            expirationDate: "2027-01-31",
          },
          {
            purchaseDetailId: detailId,
            receivedQuantity: 18,
            expirationDate: "2027-03-31",
          },
        ],
      },
      admin,
    );

    expect(generalStock.increase).toHaveBeenNthCalledWith(
      1,
      tx,
      productId,
      new Date("2027-01-31T00:00:00.000Z"),
      30,
    );
    expect(generalStock.increase).toHaveBeenNthCalledWith(
      2,
      tx,
      productId,
      new Date("2027-03-31T00:00:00.000Z"),
      18,
    );
    expect(tx.purchaseDetail.update).toHaveBeenCalledWith({
      where: { id: detailId },
      data: { receivedQuantity: 48, received: false },
    });
    const movements = tx.inventoryMovement.create.mock.calls.map(
      ([arg]) => (arg as { data: Record<string, unknown> }).data,
    );
    expect(movements).toEqual([
      expect.objectContaining({
        movementType: "ENTRY",
        branchId: null,
        quantity: 30,
        expirationDate: new Date("2027-01-31T00:00:00.000Z"),
        purchaseId,
      }),
      expect.objectContaining({
        quantity: 18,
        expirationDate: new Date("2027-03-31T00:00:00.000Z"),
      }),
    ]);
    expect(tx.purchase.update).toHaveBeenCalledWith({
      where: { id: purchaseId },
      data: { status: "PARTIALLY_RECEIVED" },
    });
  });

  it("checks the requested quantity against the sum of all the lots of a line", async () => {
    tx.purchase.findUnique.mockResolvedValue(purchase(10));

    await expect(
      service.receive(
        purchaseId,
        {
          items: [
            {
              purchaseDetailId: detailId,
              receivedQuantity: 30,
              expirationDate: "2027-01-31",
            },
            {
              purchaseDetailId: detailId,
              receivedQuantity: 11,
              expirationDate: "2027-03-31",
            },
          ],
        },
        admin,
      ),
    ).rejects.toMatchObject({
      response: { code: "RECEIVED_EXCEEDS_REQUESTED" },
    });
    expect(generalStock.increase).not.toHaveBeenCalled();
  });

  it("rejects a lot that is already expired", async () => {
    await expect(
      service.receive(
        purchaseId,
        {
          items: [
            {
              purchaseDetailId: detailId,
              receivedQuantity: 5,
              expirationDate: "2026-10-24",
            },
          ],
        },
        admin,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "LOT_EXPIRED",
        details: { expirationDate: "2026-10-24" },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects the same line twice with the same expiration date", async () => {
    await expect(
      service.receive(
        purchaseId,
        {
          items: [
            {
              purchaseDetailId: detailId,
              receivedQuantity: 5,
              expirationDate: "2027-01-31",
            },
            {
              purchaseDetailId: detailId,
              receivedQuantity: 5,
              expirationDate: "2027-01-31",
            },
          ],
        },
        admin,
      ),
    ).rejects.toMatchObject({
      response: { code: "DUPLICATED_PURCHASE_DETAIL" },
    });
  });

  it("does not touch the general stock for a line received with zero units", async () => {
    await service.receive(
      purchaseId,
      {
        items: [
          {
            purchaseDetailId: detailId,
            receivedQuantity: 0,
            expirationDate: "2026-01-01",
          },
        ],
      },
      admin,
    );

    expect(generalStock.increase).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});
