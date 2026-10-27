import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ValidationPipe } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import {
  AdjustmentMovementType,
  CreateAdjustmentDto,
} from "./dto/create-adjustment.dto.js";
import { InventoryMovementsService } from "./inventory-movements.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const reason = "Diferencia detectada en el conteo físico del cierre";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const tx = {
  branch: { findUnique: jest.fn<AsyncMock>() },
  product: { findUnique: jest.fn<AsyncMock>() },
  inventoryClosure: { findUnique: jest.fn<AsyncMock>() },
  branchInventory: {
    findMany: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    aggregate: jest.fn<AsyncMock>(),
  },
  generalStock: { findFirst: jest.fn<AsyncMock>() },
  inventoryMovement: { create: jest.fn<AsyncMock>() },
  $queryRaw: jest.fn<AsyncMock>(),
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
const generalStock = {
  consume: jest.fn<AsyncMock>(),
  increase: jest.fn<AsyncMock>(),
};

const superadmin: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const lots = [
  {
    id: "lot-expired",
    quantity: 3,
    minimumStock: 6,
    expirationDate: day("2026-09-30"),
  },
  {
    id: "lot-fefo",
    quantity: 10,
    minimumStock: 6,
    expirationDate: day("2027-02-28"),
  },
];

function adjustment(
  overrides: Partial<CreateAdjustmentDto> = {},
): CreateAdjustmentDto {
  return {
    branchId,
    productId,
    movementType: AdjustmentMovementType.ADJUSTMENT_EXIT,
    quantity: 2,
    reason,
    ...overrides,
  };
}

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

function validateBody(body: Record<string, unknown>) {
  return validationPipe.transform(body, {
    type: "body",
    metatype: CreateAdjustmentDto,
  }) as Promise<CreateAdjustmentDto>;
}

function auditInput() {
  const [input] = audit.createAuditLog.mock.calls[0] as [
    Record<string, unknown>,
  ];
  return input;
}

describe("InventoryMovementsService.createAdjustment", () => {
  let service: InventoryMovementsService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-26T15:00:00.000Z") });
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.branch.findUnique.mockResolvedValue({
      id: branchId,
      name: "Centro",
      active: true,
    });
    tx.product.findUnique.mockResolvedValue({ id: productId, active: true });
    tx.inventoryClosure.findUnique.mockResolvedValue(null);
    tx.branchInventory.findMany.mockResolvedValue(lots);
    tx.branchInventory.aggregate.mockResolvedValue({ _sum: { quantity: 11 } });
    tx.inventoryMovement.create.mockImplementation((arg) => {
      const { data } = arg as { data: Record<string, unknown> };
      return Promise.resolve({
        id: "movement-id",
        movementType: data.movementType,
        quantity: data.quantity,
        expirationDate: data.expirationDate,
        movementAt: new Date("2026-10-26T15:00:00.000Z"),
        observation: data.observation,
        saleId: null,
        purchaseId: null,
        product: {
          id: productId,
          name: "Omega 3",
          referenceCode: "OMEGA-3",
          unitOfMeasure: { abreviation: "und" },
        },
        branch: { id: branchId, name: "Centro" },
        originBranch: null,
        user: {
          personId: userId,
          person: { firstName: "Ana", lastName: null },
        },
      });
    });
    lowStock.levels.mockResolvedValue(new Map());
    service = new InventoryMovementsService(
      prisma as never,
      audit as never,
      lowStock as never,
      generalStock as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("validation", () => {
    it("rejects a branch that does not exist", async () => {
      tx.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.createAdjustment(adjustment(), superadmin),
      ).rejects.toMatchObject({ response: { code: "BRANCH_NOT_FOUND" } });
    });

    it("rejects an inactive branch", async () => {
      tx.branch.findUnique.mockResolvedValue({ id: branchId, active: false });

      await expect(
        service.createAdjustment(adjustment(), superadmin),
      ).rejects.toMatchObject({ response: { code: "BRANCH_INACTIVE" } });
    });

    it("rejects an inactive product", async () => {
      tx.product.findUnique.mockResolvedValue({ id: productId, active: false });

      await expect(
        service.createAdjustment(adjustment(), superadmin),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_INACTIVE" } });
    });

    it("rejects a product that is not assigned to the branch", async () => {
      tx.branchInventory.findMany.mockResolvedValue([]);

      await expect(
        service.createAdjustment(adjustment(), superadmin),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_NOT_ASSIGNED" } });
    });

    it("rejects more units than the lot holds", async () => {
      await expect(
        service.createAdjustment(adjustment({ quantity: 11 }), superadmin),
      ).rejects.toMatchObject({
        response: {
          code: "INSUFFICIENT_STOCK",
          details: { available: 10, requested: 11 },
        },
      });
    });
  });

  describe("ADJUSTMENT_EXIT", () => {
    it("takes the earliest current lot when no lot is sent", async () => {
      await service.createAdjustment(adjustment(), superadmin);

      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "lot-fefo" },
        data: { quantity: { decrement: 2 } },
      });
    });

    it("can lower an expired lot when it is sent", async () => {
      await service.createAdjustment(
        adjustment({ expirationDate: "2026-09-30", quantity: 3 }),
        superadmin,
      );

      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "lot-expired" },
        data: { quantity: { decrement: 3 } },
      });
    });

    it("rejects a lot the branch does not have", async () => {
      await expect(
        service.createAdjustment(
          adjustment({ expirationDate: "2028-01-01" }),
          superadmin,
        ),
      ).rejects.toMatchObject({ response: { code: "LOT_NOT_FOUND" } });
    });
  });

  describe("ADJUSTMENT_ENTRY", () => {
    const entry = (overrides: Partial<CreateAdjustmentDto> = {}) =>
      adjustment({
        movementType: AdjustmentMovementType.ADJUSTMENT_ENTRY,
        ...overrides,
      });

    it("adds to the earliest current lot when no lot is sent", async () => {
      await service.createAdjustment(entry(), superadmin);

      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "lot-fefo" },
        data: { quantity: { increment: 2 } },
      });
    });

    it("creates the lot with the branch minimum when the sent lot is new", async () => {
      await service.createAdjustment(
        entry({ expirationDate: "2027-08-31" }),
        superadmin,
      );

      expect(tx.branchInventory.create).toHaveBeenCalledWith({
        data: {
          branchId,
          productId,
          expirationDate: day("2027-08-31"),
          quantity: 2,
          minimumStock: 6,
        },
      });
    });

    it("asks for the lot when the branch only has expired lots", async () => {
      tx.branchInventory.findMany.mockResolvedValue([lots[0]]);

      await expect(
        service.createAdjustment(entry(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "EXPIRATION_DATE_REQUIRED" },
      });
    });

    it("never touches the general stock", async () => {
      await service.createAdjustment(entry(), superadmin);

      expect(generalStock.consume).not.toHaveBeenCalled();
      expect(tx.generalStock.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("closed days and audit", () => {
    it("records an INVENTORY_ADJUSTMENT audit with the reason", async () => {
      await service.createAdjustment(adjustment(), superadmin, "10.0.0.1");

      expect(auditInput()).toEqual({
        userId,
        action: "INVENTORY_ADJUSTMENT",
        entity: "INVENTORY_MOVEMENT",
        entityId: "movement-id",
        newData: {
          branchId,
          productId,
          movementType: "ADJUSTMENT_EXIT",
          quantity: 2,
          expirationDate: "2027-02-28",
          resultingQuantity: 11,
        },
        reason,
        ipAddress: "10.0.0.1",
      });
    });

    it.each([
      ["confirmed", { status: "CONFIRMED", locked: true }],
      ["locked", { status: "NOT_CONFIRMED", locked: true }],
    ])(
      "is allowed after a %s closure and is audited as POST_CLOSURE_ADJUSTMENT",
      async (_label, closure) => {
        tx.inventoryClosure.findUnique.mockResolvedValue(closure);

        await expect(
          service.createAdjustment(adjustment(), superadmin),
        ).resolves.toBeDefined();
        expect(auditInput()).toMatchObject({
          action: "POST_CLOSURE_ADJUSTMENT",
        });
      },
    );

    it("stores the reason as the movement observation", async () => {
      await service.createAdjustment(adjustment(), superadmin);

      const [args] = tx.inventoryMovement.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({
        movementType: "ADJUSTMENT_EXIT",
        observation: reason,
        expirationDate: day("2027-02-28"),
      });
    });

    it("returns the movement with the resulting quantity", async () => {
      const result = await service.createAdjustment(adjustment(), superadmin);

      expect(result).toMatchObject({
        movementType: "ADJUSTMENT_EXIT",
        observation: reason,
        user: { id: userId, fullName: "Ana" },
        resultingQuantity: 11,
      });
    });

    it("evaluates the low stock alert", async () => {
      await service.createAdjustment(adjustment(), superadmin);

      expect(lowStock.notifyCrossings).toHaveBeenCalledWith(
        tx,
        branchId,
        expect.any(Map),
      );
    });
  });

  describe("DTO validation", () => {
    const valid = {
      branchId,
      productId,
      movementType: "ADJUSTMENT_ENTRY",
      quantity: 2,
      reason,
    };

    it("accepts a valid adjustment and trims the reason", async () => {
      await expect(
        validateBody({ ...valid, reason: `  ${reason}  ` }),
      ).resolves.toMatchObject({ reason });
    });

    it.each([
      ["a missing reason", { reason: undefined }],
      ["a reason shorter than 10 characters", { reason: "Conteo" }],
      ["a reason of spaces", { reason: "             " }],
      ["a manual EXIT type", { movementType: "EXIT" }],
      ["the old adjustmentType field", { adjustmentType: "ENTRY" }],
      ["a zero quantity", { quantity: 0 }],
      ["a non-UUID branchId", { branchId: "centro" }],
      ["an invalid expirationDate", { expirationDate: "2027-02-30T00:00" }],
    ])("rejects %s", async (_label, overrides) => {
      await expect(validateBody({ ...valid, ...overrides })).rejects.toThrow();
    });
  });
});
