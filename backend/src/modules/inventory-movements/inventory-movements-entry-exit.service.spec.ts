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
  CreateMovementDto,
  DirectMovementType,
} from "./dto/create-movement.dto.js";
import { InventoryMovementsService } from "./inventory-movements.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherBranchId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const productId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
const leader: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: branchId, name: "Centro" }],
};
const assistant: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "BRANCH_ASSISTANT" },
  branches: [{ id: otherBranchId, name: "Norte" }],
};

const lots = [
  {
    id: "lot-expired",
    quantity: 4,
    minimumStock: 5,
    expirationDate: day("2026-10-01"),
  },
  {
    id: "lot-empty",
    quantity: 0,
    minimumStock: 5,
    expirationDate: day("2026-11-30"),
  },
  {
    id: "lot-fefo",
    quantity: 8,
    minimumStock: 5,
    expirationDate: day("2027-01-31"),
  },
  {
    id: "lot-late",
    quantity: 20,
    minimumStock: 5,
    expirationDate: day("2027-06-30"),
  },
];

function movementRow(data: Record<string, unknown>) {
  return {
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
      name: "Whey Protein 2 lb",
      referenceCode: "WHEY-2LB-001",
      unitOfMeasure: { abreviation: "und" },
    },
    branch: { id: branchId, name: "Centro" },
    originBranch: null,
    user: {
      personId: userId,
      person: { firstName: "Laura", lastName: "Pérez" },
    },
  };
}

function entry(overrides: Partial<CreateMovementDto> = {}): CreateMovementDto {
  return {
    branchId,
    productId,
    movementType: DirectMovementType.ENTRY,
    quantity: 10,
    ...overrides,
  };
}

function exit(overrides: Partial<CreateMovementDto> = {}): CreateMovementDto {
  return {
    branchId,
    productId,
    movementType: DirectMovementType.EXIT,
    quantity: 3,
    observation: "Producto dañado",
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
    metatype: CreateMovementDto,
  }) as Promise<CreateMovementDto>;
}

function createdMovement() {
  const [args] = tx.inventoryMovement.create.mock.calls[0] as [
    { data: Record<string, unknown> },
  ];
  return args.data;
}

describe("InventoryMovementsService.createMovement", () => {
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
    tx.branchInventory.aggregate.mockResolvedValue({ _sum: { quantity: 29 } });
    tx.generalStock.findFirst.mockResolvedValue({
      expirationDate: day("2027-03-31"),
    });
    tx.inventoryMovement.create.mockImplementation((arg) =>
      Promise.resolve(
        movementRow((arg as { data: Record<string, unknown> }).data),
      ),
    );
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

  describe("authorization", () => {
    it("allows SUPERADMIN to register movements in any branch", async () => {
      await expect(
        service.createMovement(exit(), superadmin),
      ).resolves.toBeDefined();
    });

    it("allows a BRANCH_LEADER assigned to the branch", async () => {
      await expect(
        service.createMovement(exit(), leader),
      ).resolves.toBeDefined();
    });

    it("rejects a branch role outside its branches with BRANCH_SCOPE_VIOLATION", async () => {
      await expect(
        service.createMovement(exit(), assistant),
      ).rejects.toMatchObject({
        response: { code: "BRANCH_SCOPE_VIOLATION" },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("branch, product and day validation", () => {
    it("rejects a branch that does not exist", async () => {
      tx.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.createMovement(exit(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "BRANCH_NOT_FOUND" },
      });
    });

    it("rejects an inactive branch", async () => {
      tx.branch.findUnique.mockResolvedValue({ id: branchId, active: false });

      await expect(
        service.createMovement(exit(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "BRANCH_INACTIVE" },
      });
    });

    it("rejects a product that does not exist", async () => {
      tx.product.findUnique.mockResolvedValue(null);

      await expect(
        service.createMovement(exit(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "PRODUCT_NOT_FOUND" },
      });
    });

    it("rejects an inactive product", async () => {
      tx.product.findUnique.mockResolvedValue({ id: productId, active: false });

      await expect(
        service.createMovement(exit(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "PRODUCT_INACTIVE" },
      });
    });

    it.each([
      ["confirmed", { status: "CONFIRMED", locked: true }],
      ["locked by the nightly job", { status: "NOT_CONFIRMED", locked: true }],
    ])(
      "rejects with INVENTORY_CLOSED when today's closure is %s",
      async (_label, closure) => {
        tx.inventoryClosure.findUnique.mockResolvedValue(closure);

        await expect(
          service.createMovement(exit(), superadmin),
        ).rejects.toMatchObject({
          response: { code: "INVENTORY_CLOSED" },
        });
        expect(tx.branchInventory.update).not.toHaveBeenCalled();
      },
    );

    it("looks up the closure of the current Bogota business date", async () => {
      jest.setSystemTime(new Date("2026-10-27T03:00:00.000Z"));

      await service.createMovement(exit(), superadmin);

      expect(tx.inventoryClosure.findUnique).toHaveBeenCalledWith({
        where: {
          branchId_closureDate: { branchId, closureDate: day("2026-10-26") },
        },
        select: { status: true, locked: true },
      });
    });

    it("allows the movement while today's closure is still pending", async () => {
      tx.inventoryClosure.findUnique.mockResolvedValue({
        status: "PENDING",
        locked: false,
      });

      await expect(
        service.createMovement(exit(), superadmin),
      ).resolves.toBeDefined();
    });

    it("rejects with PRODUCT_NOT_ASSIGNED when the branch has no lot of the product", async () => {
      tx.branchInventory.findMany.mockResolvedValue([]);

      await expect(
        service.createMovement(exit(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "PRODUCT_NOT_ASSIGNED" },
      });
    });
  });

  describe("EXIT", () => {
    it("locks the lots and takes the earliest current lot with stock when no lot is sent", async () => {
      await service.createMovement(exit(), superadmin);

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "lot-fefo" },
        data: { quantity: { decrement: 3 } },
      });
      expect(createdMovement()).toMatchObject({
        movementType: "EXIT",
        quantity: 3,
        expirationDate: day("2027-01-31"),
        observation: "Producto dañado",
        userId,
      });
    });

    it("writes off an expired lot when it is sent explicitly", async () => {
      await service.createMovement(
        exit({ expirationDate: "2026-10-01", quantity: 4 }),
        superadmin,
      );

      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "lot-expired" },
        data: { quantity: { decrement: 4 } },
      });
    });

    it("rejects a lot the branch does not have with LOT_NOT_FOUND", async () => {
      await expect(
        service.createMovement(
          exit({ expirationDate: "2028-01-01" }),
          superadmin,
        ),
      ).rejects.toMatchObject({
        response: {
          code: "LOT_NOT_FOUND",
          details: { expirationDate: "2028-01-01" },
        },
      });
    });

    it("rejects more units than the lot holds with INSUFFICIENT_STOCK", async () => {
      await expect(
        service.createMovement(exit({ quantity: 9 }), superadmin),
      ).rejects.toMatchObject({
        response: {
          code: "INSUFFICIENT_STOCK",
          details: { available: 8, requested: 9, expirationDate: "2027-01-31" },
        },
      });
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects with INSUFFICIENT_STOCK when every current lot is empty", async () => {
      tx.branchInventory.findMany.mockResolvedValue([lots[0], lots[1]]);

      await expect(
        service.createMovement(exit(), superadmin),
      ).rejects.toMatchObject({
        response: {
          code: "INSUFFICIENT_STOCK",
          details: { available: 0, requested: 3, expirationDate: null },
        },
      });
    });

    it("does not touch the general stock", async () => {
      await service.createMovement(exit(), superadmin);

      expect(generalStock.consume).not.toHaveBeenCalled();
    });
  });

  describe("ENTRY", () => {
    it("consumes the sent lot from the general stock and adds it to the existing branch lot", async () => {
      await service.createMovement(
        entry({ expirationDate: "2027-06-30" }),
        superadmin,
      );

      expect(generalStock.consume).toHaveBeenCalledWith(
        tx,
        productId,
        day("2027-06-30"),
        10,
      );
      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "lot-late" },
        data: { quantity: { increment: 10 } },
      });
      expect(tx.branchInventory.create).not.toHaveBeenCalled();
    });

    it("takes the earliest current general stock lot when no lot is sent", async () => {
      await service.createMovement(entry(), superadmin);

      expect(tx.generalStock.findFirst).toHaveBeenCalledWith({
        where: {
          productId,
          quantity: { gt: 0 },
          expirationDate: { gte: day("2026-10-26") },
        },
        orderBy: { expirationDate: "asc" },
        select: { expirationDate: true },
      });
      expect(generalStock.consume).toHaveBeenCalledWith(
        tx,
        productId,
        day("2027-03-31"),
        10,
      );
    });

    it("creates the branch lot with the branch minimum when it is new", async () => {
      await service.createMovement(
        entry({ expirationDate: "2027-03-31" }),
        superadmin,
      );

      expect(tx.branchInventory.create).toHaveBeenCalledWith({
        data: {
          branchId,
          productId,
          expirationDate: day("2027-03-31"),
          quantity: 10,
          minimumStock: 5,
        },
      });
    });

    it("rejects with INSUFFICIENT_GENERAL_STOCK when the general stock has no current lot", async () => {
      tx.generalStock.findFirst.mockResolvedValue(null);

      await expect(
        service.createMovement(entry(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "INSUFFICIENT_GENERAL_STOCK" },
      });
      expect(tx.branchInventory.update).not.toHaveBeenCalled();
    });

    it("propagates INSUFFICIENT_GENERAL_STOCK from the general stock", async () => {
      generalStock.consume.mockRejectedValue(
        Object.assign(new Error("short"), {
          response: { code: "INSUFFICIENT_GENERAL_STOCK" },
        }),
      );

      await expect(
        service.createMovement(
          entry({ expirationDate: "2027-06-30" }),
          superadmin,
        ),
      ).rejects.toMatchObject({
        response: { code: "INSUFFICIENT_GENERAL_STOCK" },
      });
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("rejects an expired lot with LOT_EXPIRED", async () => {
      await expect(
        service.createMovement(
          entry({ expirationDate: "2026-10-25" }),
          superadmin,
        ),
      ).rejects.toMatchObject({ response: { code: "LOT_EXPIRED" } });
      expect(generalStock.consume).not.toHaveBeenCalled();
    });

    it("stores no observation when none is sent", async () => {
      await service.createMovement(entry(), superadmin);

      expect(createdMovement()).toMatchObject({
        movementType: "ENTRY",
        observation: null,
      });
    });
  });

  describe("response and side effects", () => {
    it("returns the contract shape with the lot and the resulting quantity", async () => {
      const result = await service.createMovement(exit(), superadmin);

      expect(result).toEqual({
        id: "movement-id",
        movementType: "EXIT",
        quantity: 3,
        expirationDate: "2027-01-31",
        product: {
          id: productId,
          name: "Whey Protein 2 lb",
          referenceCode: "WHEY-2LB-001",
          unit: "und",
        },
        branch: { id: branchId, name: "Centro" },
        originBranch: null,
        user: { id: userId, fullName: "Laura Pérez" },
        observation: "Producto dañado",
        saleId: null,
        purchaseId: null,
        movementAt: new Date("2026-10-26T15:00:00.000Z"),
        resultingQuantity: 29,
      });
    });

    it("evaluates the low stock alert with the levels taken before the change", async () => {
      const before = new Map([[productId, { total: 32, minimum: 30 }]]);
      lowStock.levels.mockResolvedValue(before);

      await service.createMovement(exit(), superadmin);

      expect(lowStock.levels).toHaveBeenCalledWith(tx, branchId, [productId]);
      expect(lowStock.notifyCrossings).toHaveBeenCalledWith(
        tx,
        branchId,
        before,
      );
    });

    it("does not write an audit log, since the movement table already traces it", async () => {
      await service.createMovement(exit(), superadmin);

      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("DTO validation", () => {
    const valid = {
      branchId,
      productId,
      movementType: "EXIT",
      quantity: 3,
      observation: "Producto dañado",
    };

    it("accepts a valid exit and trims the observation", async () => {
      await expect(
        validateBody({ ...valid, observation: "  Producto dañado  " }),
      ).resolves.toMatchObject({ observation: "Producto dañado" });
    });

    it("accepts an entry without observation or lot", async () => {
      await expect(
        validateBody({
          branchId,
          productId,
          movementType: "ENTRY",
          quantity: 1,
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      ["a missing branchId", { branchId: undefined }],
      ["a non-UUID productId", { productId: "not-a-uuid" }],
      ["a TRANSFER movementType", { movementType: "TRANSFER" }],
      ["an adjustment movementType", { movementType: "ADJUSTMENT_EXIT" }],
      ["a zero quantity", { quantity: 0 }],
      ["a decimal quantity", { quantity: 1.5 }],
      ["an exit without observation", { observation: undefined }],
      ["an exit with a blank observation", { observation: "   " }],
      ["an invalid expirationDate", { expirationDate: "31/12/2027" }],
      ["the old items array", { items: [] }],
      ["a client movement date", { movementAt: "2026-10-26" }],
    ])("rejects %s", async (_label, overrides) => {
      await expect(validateBody({ ...valid, ...overrides })).rejects.toThrow();
    });
  });
});
