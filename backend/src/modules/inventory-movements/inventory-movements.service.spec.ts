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
import { CreateTransferDto } from "./dto/create-transfer.dto.js";
import { InventoryMovementsService } from "./inventory-movements.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const originBranchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const destinationBranchId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
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
const leaderAtOrigin: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: originBranchId, name: "Centro" }],
};
const leaderAtDestination: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: destinationBranchId, name: "Norte" }],
};

const originLots = [
  {
    id: "origin-expired",
    quantity: 6,
    minimumStock: 4,
    expirationDate: day("2026-10-20"),
  },
  {
    id: "origin-fefo",
    quantity: 12,
    minimumStock: 4,
    expirationDate: day("2027-01-31"),
  },
  {
    id: "origin-late",
    quantity: 30,
    minimumStock: 4,
    expirationDate: day("2027-06-30"),
  },
];
const destinationLots = [
  {
    id: "destination-late",
    quantity: 2,
    minimumStock: 9,
    expirationDate: day("2027-06-30"),
  },
];

function lotsFor(arg: unknown) {
  const { where } = arg as { where: { branchId: string } };
  return Promise.resolve(
    where.branchId === originBranchId ? originLots : destinationLots,
  );
}

function transfer(
  overrides: Partial<CreateTransferDto> = {},
): CreateTransferDto {
  return {
    originBranchId,
    branchId: destinationBranchId,
    productId,
    quantity: 5,
    observation: "Reposición sede Norte",
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
    metatype: CreateTransferDto,
  }) as Promise<CreateTransferDto>;
}

describe("InventoryMovementsService.createTransfer", () => {
  let service: InventoryMovementsService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-26T15:00:00.000Z") });
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.branch.findUnique.mockImplementation((arg) => {
      const id = (arg as { where: { id: string } }).where.id;
      return Promise.resolve({
        id,
        name: id === originBranchId ? "Centro" : "Norte",
        active: true,
      });
    });
    tx.product.findUnique.mockResolvedValue({ id: productId, active: true });
    tx.inventoryClosure.findUnique.mockResolvedValue(null);
    tx.branchInventory.findMany.mockImplementation(lotsFor);
    tx.branchInventory.aggregate.mockImplementation((arg) => {
      const { where } = arg as { where: { branchId: string } };
      return Promise.resolve({
        _sum: { quantity: where.branchId === originBranchId ? 43 : 7 },
      });
    });
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
          name: "Creatina 300 g",
          referenceCode: "CREA-300",
          unitOfMeasure: { abreviation: "und" },
        },
        branch: { id: destinationBranchId, name: "Norte" },
        originBranch: { id: originBranchId, name: "Centro" },
        user: {
          personId: userId,
          person: { firstName: "Laura", lastName: "Pérez" },
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

  describe("authorization", () => {
    it("allows SUPERADMIN to transfer between any branches", async () => {
      await expect(
        service.createTransfer(transfer(), superadmin),
      ).resolves.toBeDefined();
    });

    it("allows a BRANCH_LEADER of the origin branch", async () => {
      await expect(
        service.createTransfer(transfer(), leaderAtOrigin),
      ).resolves.toBeDefined();
    });

    it("rejects a BRANCH_LEADER that only belongs to the destination", async () => {
      await expect(
        service.createTransfer(transfer(), leaderAtDestination),
      ).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_VIOLATION" } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("rejects the same branch as origin and destination", async () => {
      await expect(
        service.createTransfer(
          transfer({ branchId: originBranchId }),
          superadmin,
        ),
      ).rejects.toMatchObject({ response: { code: "SAME_BRANCH_TRANSFER" } });
    });

    it.each([
      ["origin", originBranchId],
      ["destination", destinationBranchId],
    ])("rejects an inactive %s branch", async (_label, inactiveId) => {
      tx.branch.findUnique.mockImplementation((arg) => {
        const id = (arg as { where: { id: string } }).where.id;
        return Promise.resolve({ id, name: "Sede", active: id !== inactiveId });
      });

      await expect(
        service.createTransfer(transfer(), superadmin),
      ).rejects.toMatchObject({
        response: {
          code: "BRANCH_INACTIVE",
          details: { branchId: inactiveId },
        },
      });
    });

    it("rejects a branch that does not exist", async () => {
      tx.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.createTransfer(transfer(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "BRANCH_NOT_FOUND" },
      });
    });

    it.each([
      ["origin", originBranchId],
      ["destination", destinationBranchId],
    ])(
      "rejects with INVENTORY_CLOSED when the %s branch closed today",
      async (_label, closedId) => {
        tx.inventoryClosure.findUnique.mockImplementation((arg) => {
          const { where } = arg as {
            where: { branchId_closureDate: { branchId: string } };
          };
          return Promise.resolve(
            where.branchId_closureDate.branchId === closedId
              ? { status: "CONFIRMED", locked: true }
              : null,
          );
        });

        await expect(
          service.createTransfer(transfer(), superadmin),
        ).rejects.toMatchObject({
          response: {
            code: "INVENTORY_CLOSED",
            details: { branchId: closedId },
          },
        });
      },
    );

    it("rejects with PRODUCT_NOT_ASSIGNED when the origin has no lot", async () => {
      tx.branchInventory.findMany.mockResolvedValue([]);

      await expect(
        service.createTransfer(transfer(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "PRODUCT_NOT_ASSIGNED" },
      });
    });

    it("rejects with PRODUCT_NOT_ASSIGNED_IN_DESTINATION instead of creating the product there", async () => {
      tx.branchInventory.findMany.mockImplementation((arg) => {
        const { where } = arg as { where: { branchId: string } };
        return Promise.resolve(
          where.branchId === originBranchId ? originLots : [],
        );
      });

      await expect(
        service.createTransfer(transfer(), superadmin),
      ).rejects.toMatchObject({
        response: { code: "PRODUCT_NOT_ASSIGNED_IN_DESTINATION" },
      });
      expect(tx.branchInventory.create).not.toHaveBeenCalled();
    });

    it("does not transfer an expired lot", async () => {
      await expect(
        service.createTransfer(
          transfer({ expirationDate: "2026-10-20" }),
          superadmin,
        ),
      ).rejects.toMatchObject({ response: { code: "LOT_EXPIRED" } });
      expect(tx.branchInventory.update).not.toHaveBeenCalled();
    });

    it("rejects more units than the origin lot holds", async () => {
      await expect(
        service.createTransfer(transfer({ quantity: 13 }), superadmin),
      ).rejects.toMatchObject({
        response: {
          code: "INSUFFICIENT_STOCK",
          details: {
            available: 12,
            requested: 13,
            expirationDate: "2027-01-31",
          },
        },
      });
    });
  });

  describe("happy path", () => {
    it("moves the earliest current origin lot into a new destination lot that keeps the destination minimum", async () => {
      await service.createTransfer(transfer(), superadmin);

      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "origin-fefo" },
        data: { quantity: { decrement: 5 } },
      });
      expect(tx.branchInventory.create).toHaveBeenCalledWith({
        data: {
          branchId: destinationBranchId,
          productId,
          expirationDate: day("2027-01-31"),
          quantity: 5,
          minimumStock: 9,
        },
      });
    });

    it("adds to the destination lot with the same expiration when it exists", async () => {
      await service.createTransfer(
        transfer({ expirationDate: "2027-06-30" }),
        superadmin,
      );

      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "origin-late" },
        data: { quantity: { decrement: 5 } },
      });
      expect(tx.branchInventory.update).toHaveBeenCalledWith({
        where: { id: "destination-late" },
        data: { quantity: { increment: 5 } },
      });
      expect(tx.branchInventory.create).not.toHaveBeenCalled();
    });

    it("creates a single TRANSFER movement with the lot", async () => {
      await service.createTransfer(transfer(), superadmin);

      expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
      const [args] = tx.inventoryMovement.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toEqual({
        productId,
        branchId: destinationBranchId,
        originBranchId,
        userId,
        movementType: "TRANSFER",
        quantity: 5,
        expirationDate: day("2027-01-31"),
        observation: "Reposición sede Norte",
      });
    });

    it("evaluates the low stock alert in the origin branch", async () => {
      const before = new Map([[productId, { total: 48, minimum: 45 }]]);
      lowStock.levels.mockResolvedValue(before);

      await service.createTransfer(transfer(), superadmin);

      expect(lowStock.levels).toHaveBeenCalledWith(tx, originBranchId, [
        productId,
      ]);
      expect(lowStock.notifyCrossings).toHaveBeenCalledWith(
        tx,
        originBranchId,
        before,
      );
    });

    it("returns the movement with both branches and their resulting quantities", async () => {
      const result = await service.createTransfer(transfer(), superadmin);

      expect(result).toMatchObject({
        movementType: "TRANSFER",
        expirationDate: "2027-01-31",
        branch: { id: destinationBranchId, name: "Norte" },
        originBranch: { id: originBranchId, name: "Centro" },
        resultingQuantity: 7,
        originResultingQuantity: 43,
      });
    });

    it("neither touches the general stock nor writes an audit log", async () => {
      await service.createTransfer(transfer(), superadmin);

      expect(generalStock.consume).not.toHaveBeenCalled();
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("DTO validation", () => {
    const valid = {
      originBranchId,
      branchId: destinationBranchId,
      productId,
      quantity: 5,
    };

    it("accepts a transfer without observation or lot", async () => {
      await expect(validateBody(valid)).resolves.toBeDefined();
    });

    it.each([
      ["a missing originBranchId", { originBranchId: undefined }],
      ["a missing destination branchId", { branchId: undefined }],
      ["the old destinationBranchId field", { destinationBranchId }],
      ["a zero quantity", { quantity: 0 }],
      ["a negative quantity", { quantity: -2 }],
      ["an invalid expirationDate", { expirationDate: "2027-13-01" }],
      ["an observation above 500 characters", { observation: "x".repeat(501) }],
    ])("rejects %s", async (_label, overrides) => {
      await expect(validateBody({ ...valid, ...overrides })).rejects.toThrow();
    });
  });
});
