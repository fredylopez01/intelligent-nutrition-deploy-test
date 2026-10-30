import "reflect-metadata";
import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const lowStockMock = {
  levels: async () => new Map(),
  notifyCrossings: async () => 0,
};
type TransactionClient = typeof transactionMock;

const saleId = "99999999-9999-4999-8999-999999999999";
const branchId = "11111111-1111-4111-8111-111111111111";
const productId = "44444444-4444-4444-8444-444444444444";
const lotId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "33333333-3333-4333-8333-333333333333";
const saleAt = new Date("2026-10-26T15:30:00.000Z");
const reversalReason = "Customer returned the full purchase";

const transactionMock = {
  $queryRaw: jest.fn<AsyncMock>(),
  inventoryClosure: { findUnique: jest.fn<AsyncMock>() },
  branchInventory: {
    findMany: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
  inventoryMovement: {
    create: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
  },
  sale: {
    findUnique: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
};

const prismaMock = {
  $transaction:
    jest.fn<
      (
        callback: (client: TransactionClient) => Promise<unknown>,
      ) => Promise<unknown>
    >(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { LowStockService } =
  await import("../notifications/low-stock.service.js");
const { SalesService } = await import("./sales.service.js");
const { Reflector } = await import("@nestjs/core");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const { ROLES_KEY } =
  await import("../../common/decorators/roles.decorator.js");
const { SalesController } = await import("./sales.controller.js");

const superadmin: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const buildSale = (status: string) => ({
  id: saleId,
  saleNumber: "V-20261026-0001",
  status,
  branchId,
  saleAt,
  total: "24.70",
  details: [{ id: "detail-1", productId, quantity: 2 }],
});

const buildUpdatedSale = () => ({
  id: saleId,
  saleNumber: "V-20261026-0001",
  status: "REVERSED",
  saleAt,
  subtotal: "24.70",
  discountAmount: "0.00",
  taxAmount: "0.00",
  total: "24.70",
  reversalReason,
  reversedAt: new Date("2026-10-26T16:00:00.000Z"),
  branch: { id: branchId, name: "Sede Centro" },
  user: {
    personId: userId,
    person: { firstName: "Ana", lastName: "Pruebas" },
  },
  customer: null,
  details: [
    {
      productId,
      quantity: 2,
      unitPrice: "12.35",
      subtotal: "24.70",
      discountAmount: "0.00",
      taxAmount: "0.00",
      total: "24.70",
      product: { name: "Proteína", referenceCode: "P-001" },
    },
  ],
  payments: [],
});

describe("SalesService.reverse", () => {
  let service: InstanceType<typeof SalesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) =>
      callback(transactionMock),
    );
    transactionMock.$queryRaw.mockResolvedValue([]);
    transactionMock.inventoryClosure.findUnique.mockResolvedValue(null);
    transactionMock.branchInventory.findMany.mockResolvedValue([
      {
        id: lotId,
        quantity: 3,
        expirationDate: new Date("2027-10-26T00:00:00.000Z"),
      },
    ]);
    transactionMock.branchInventory.update.mockResolvedValue({});
    transactionMock.inventoryMovement.create.mockResolvedValue({});
    transactionMock.inventoryMovement.findMany.mockResolvedValue([]);
    transactionMock.branchInventory.create.mockResolvedValue({});
    transactionMock.sale.update.mockResolvedValue({});
    transactionMock.sale.findUnique.mockResolvedValue(buildUpdatedSale());
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: LowStockService, useValue: lowStockMock },
      ],
    }).compile();
    service = module.get(SalesService);
  });

  it("reverses a sale and restores stock in the earliest-expiring lot", async () => {
    transactionMock.sale.findUnique
      .mockResolvedValueOnce(buildSale("COMPLETED"))
      .mockResolvedValueOnce(buildUpdatedSale());

    const result = await service.reverse(
      saleId,
      { reason: reversalReason },
      superadmin,
      "127.0.0.1",
    );

    expect(transactionMock.branchInventory.update).toHaveBeenCalledWith({
      where: { id: lotId },
      data: { quantity: { increment: 2 } },
    });
    expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
      data: {
        productId,
        branchId,
        originBranchId: null,
        userId,
        movementType: "ENTRY",
        quantity: 2,
        expirationDate: new Date("2027-10-26T00:00:00.000Z"),
        observation: `Reversal of sale V-20261026-0001: ${reversalReason}`,
        saleId,
        purchaseId: null,
      },
    });
    expect(transactionMock.sale.update).toHaveBeenCalledWith({
      where: { id: saleId },
      data: {
        status: "REVERSED",
        reversalReason,
        reversedAt: expect.any(Date),
      },
    });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        action: "REVERSE",
        entity: "SALE",
        entityId: saleId,
        reason: reversalReason,
        ipAddress: "127.0.0.1",
        newData: expect.objectContaining({
          status: "REVERSED",
          reason: reversalReason,
          restoredItems: [{ productId, quantity: 2 }],
        }),
      }),
      transactionMock,
    );
    expect(result).toMatchObject({
      id: saleId,
      status: "REVERSED",
      reversalReason,
      items: [{ productId, quantity: 2 }],
    });
  });

  it("returns each unit to the lot it was sold from, recreating a lot that no longer exists", async () => {
    transactionMock.sale.findUnique
      .mockResolvedValueOnce(buildSale("COMPLETED"))
      .mockResolvedValueOnce(buildUpdatedSale());
    transactionMock.inventoryMovement.findMany.mockResolvedValue([
      {
        productId,
        quantity: 1,
        expirationDate: new Date("2027-10-26T00:00:00.000Z"),
      },
      {
        productId,
        quantity: 1,
        expirationDate: new Date("2027-12-31T00:00:00.000Z"),
      },
    ]);

    await service.reverse(saleId, { reason: reversalReason }, superadmin);

    expect(transactionMock.branchInventory.update).toHaveBeenCalledWith({
      where: { id: lotId },
      data: { quantity: { increment: 1 } },
    });
    expect(transactionMock.branchInventory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId,
        productId,
        quantity: 1,
        expirationDate: new Date("2027-12-31T00:00:00.000Z"),
      }),
    });
    expect(transactionMock.inventoryMovement.create).toHaveBeenCalledTimes(2);
  });

  it("throws SALE_ALREADY_REVERSED when the sale has already been reversed", async () => {
    transactionMock.sale.findUnique.mockResolvedValue(buildSale("REVERSED"));

    await expect(
      service.reverse(saleId, { reason: reversalReason }, superadmin),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "SALE_ALREADY_REVERSED" },
    });

    expect(transactionMock.branchInventory.update).not.toHaveBeenCalled();
    expect(transactionMock.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("throws SALE_NOT_FOUND when the sale does not exist", async () => {
    transactionMock.sale.findUnique.mockResolvedValue(null);

    await expect(
      service.reverse(saleId, { reason: reversalReason }, superadmin),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "SALE_NOT_FOUND" },
    });

    expect(transactionMock.branchInventory.update).not.toHaveBeenCalled();
    expect(transactionMock.inventoryMovement.create).not.toHaveBeenCalled();
  });
});

describe("POST /sales/:saleId/reverse role guard", () => {
  const guard = new RolesGuard(new Reflector());
  const reverseMethod: unknown = Object.getOwnPropertyDescriptor(
    SalesController.prototype,
    "reverse",
  )?.value;

  if (typeof reverseMethod !== "function") {
    throw new Error("SalesController.reverse handler is missing");
  }

  const requiredRolesMetadata: unknown = Reflect.getMetadata(
    ROLES_KEY,
    reverseMethod,
  );
  if (
    !Array.isArray(requiredRolesMetadata) ||
    requiredRolesMetadata.some((role: unknown) => typeof role !== "string")
  ) {
    throw new Error("SalesController.reverse roles are missing");
  }
  const requiredRoles = requiredRolesMetadata as string[];

  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_KEY, requiredRoles, handler);

  const contextFor = (roleName: string): ExecutionContext => {
    const user: AuthenticatedUser = {
      id: userId,
      active: true,
      role: { name: roleName },
    };
    return {
      getArgs: () => [{ user }],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({
        getData: () => undefined,
        getContext: () => undefined,
      }),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => undefined,
        getNext: () => undefined,
      }),
      switchToWs: () => ({
        getClient: () => undefined,
        getData: () => undefined,
        getPattern: () => "",
      }),
      getType: () => "http",
      getClass: () => SalesController,
      getHandler: () => handler,
    } as ExecutionContext;
  };

  it.each(["SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT"])(
    "allows the %s role to reverse a sale",
    (roleName) => {
      expect(guard.canActivate(contextFor(roleName))).toBe(true);
    },
  );

  it("denies roles without permission to reverse sales", () => {
    expect(() => guard.canActivate(contextFor("DEV"))).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: "INSUFFICIENT_PERMISSIONS",
        }),
      }),
    );
    expect(requiredRoles).toEqual([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
  });
});
