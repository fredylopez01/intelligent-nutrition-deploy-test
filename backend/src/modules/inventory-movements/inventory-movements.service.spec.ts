import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateTransferDto } from "./dto/create-transfer.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionCallback = (client: typeof transactionMock) => Promise<unknown>;

const originBranchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const destBranchId   = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productId      = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userId         = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const movementId     = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const originLotId    = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const destLotId      = "11111111-1111-4111-8111-111111111111";

const EXP_DATE = "2027-12-31";
const expDate  = new Date(EXP_DATE);

const originBranchRecord = { id: originBranchId, name: "Sede Origen",  active: true };
const destBranchRecord   = { id: destBranchId,   name: "Sede Destino", active: true };
const productRecord = {
  id: productId,
  name: "Leche Entera",
  referenceCode: "LECHE-001",
  active: true,
  unitOfMeasure: { abreviation: "L" },
};

const transactionMock = {
  branch: {
    findUnique: jest.fn<AsyncMock>(),
  },
  product: {
    findMany: jest.fn<AsyncMock>(),
  },
  branchInventory: {
    findUnique: jest.fn<AsyncMock>(),
    update:     jest.fn<AsyncMock>(),
    create:     jest.fn<AsyncMock>(),
  },
  inventoryMovement: {
    create: jest.fn<AsyncMock>(),
  },
  $queryRaw: jest.fn<AsyncMock>(),
};

const prismaMock = {
  $transaction: jest.fn<(op: TransactionCallback) => Promise<unknown>>(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { PrismaService }             = await import("../../database/prisma/prisma.service.js");
const { AuditService }              = await import("../audit/audit.service.js");
const { InventoryMovementsService } = await import("./inventory-movements.service.js");

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const superadminUser: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const leaderUser: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: originBranchId, name: "Sede Origen" }],
};

function validDto(): CreateTransferDto {
  return {
    originBranchId,
    destinationBranchId: destBranchId,
    items: [{ productId, quantity: 10, expirationDate: EXP_DATE }],
  } as CreateTransferDto;
}

async function validateBody(body: Record<string, unknown>) {
  return validationPipe.transform(body, {
    type: "body",
    metatype: CreateTransferDto,
  }) as Promise<CreateTransferDto>;
}

describe("InventoryMovementsService.createTransfer", () => {
  let service: InstanceType<typeof InventoryMovementsService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((op) => op(transactionMock));

    transactionMock.branch.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === originBranchId) return Promise.resolve(originBranchRecord);
      if (where.id === destBranchId)   return Promise.resolve(destBranchRecord);
      return Promise.resolve(null);
    });

    transactionMock.product.findMany.mockResolvedValue([productRecord]);
    transactionMock.$queryRaw.mockResolvedValue([]);

    transactionMock.branchInventory.findUnique.mockImplementation(({ where }: any) => {
      const { branchId } = where.branchId_productId_expirationDate;
      if (branchId === originBranchId) return Promise.resolve({ id: originLotId, quantity: 50 });
      return Promise.resolve(null);
    });

    transactionMock.branchInventory.update.mockResolvedValue({});
    transactionMock.branchInventory.create.mockResolvedValue({});
    transactionMock.inventoryMovement.create.mockResolvedValue({ id: movementId });
    auditMock.createAuditLog.mockResolvedValue({});

    testingModule = await Test.createTestingModule({
      providers: [
        InventoryMovementsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = testingModule.get(InventoryMovementsService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  describe("authorization", () => {
    it("allows SUPERADMIN to transfer between any branches", async () => {
      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).resolves.toBeDefined();
    });

    it("allows DEV to transfer between any branches", async () => {
      const dev: AuthenticatedUser = { id: userId, active: true, role: { name: "DEV" } };

      await expect(
        service.createTransfer(validDto(), dev),
      ).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER assigned to the origin branch", async () => {
      await expect(
        service.createTransfer(validDto(), leaderUser),
      ).resolves.toBeDefined();
    });

    it("rejects BRANCH_LEADER not assigned to the origin branch", async () => {
      const leader: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_LEADER" },
        branches: [{ id: destBranchId, name: "Sede Destino" }],
      };

      await expect(
        service.createTransfer(validDto(), leader),
      ).rejects.toMatchObject({ response: { code: "FORBIDDEN_BRANCH" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects BRANCH_ASSISTANT without access to the origin branch", async () => {
      const assistant: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_ASSISTANT" },
        branches: [],
      };

      await expect(
        service.createTransfer(validDto(), assistant),
      ).rejects.toMatchObject({ response: { code: "FORBIDDEN_BRANCH" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("pre-transaction validation", () => {
    it("rejects when origin and destination are the same branch", async () => {
      const dto: CreateTransferDto = {
        ...validDto(),
        destinationBranchId: originBranchId,
      };

      await expect(
        service.createTransfer(dto, superadminUser),
      ).rejects.toMatchObject({ response: { code: "SAME_BRANCH" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects when items contain duplicate product and expiration date", async () => {
      const dto: CreateTransferDto = {
        ...validDto(),
        items: [
          { productId, quantity: 5,  expirationDate: EXP_DATE },
          { productId, quantity: 10, expirationDate: EXP_DATE },
        ],
      };

      await expect(
        service.createTransfer(dto, superadminUser),
      ).rejects.toMatchObject({ response: { code: "DUPLICATED_ITEM" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("allows two items with the same product but different expiration dates", async () => {
      const dto: CreateTransferDto = {
        ...validDto(),
        items: [
          { productId, quantity: 5, expirationDate: "2027-12-31" },
          { productId, quantity: 5, expirationDate: "2028-06-30" },
        ],
      };

      await expect(
        service.createTransfer(dto, superadminUser),
      ).resolves.toBeDefined();
    });
  });

  describe("branch validation", () => {
    it("rejects when the origin branch does not exist", async () => {
      transactionMock.branch.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === originBranchId) return Promise.resolve(null);
        return Promise.resolve(destBranchRecord);
      });

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "ORIGIN_BRANCH_NOT_FOUND" } });
    });

    it("rejects when the origin branch is inactive", async () => {
      transactionMock.branch.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === originBranchId)
          return Promise.resolve({ ...originBranchRecord, active: false });
        return Promise.resolve(destBranchRecord);
      });

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "ORIGIN_BRANCH_INACTIVE" } });
    });

    it("rejects when the destination branch does not exist", async () => {
      transactionMock.branch.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === destBranchId) return Promise.resolve(null);
        return Promise.resolve(originBranchRecord);
      });

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "DESTINATION_BRANCH_NOT_FOUND" } });
    });

    it("rejects when the destination branch is inactive", async () => {
      transactionMock.branch.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === destBranchId)
          return Promise.resolve({ ...destBranchRecord, active: false });
        return Promise.resolve(originBranchRecord);
      });

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "DESTINATION_BRANCH_INACTIVE" } });
    });
  });

  describe("product validation", () => {
    it("rejects when a product in the items list does not exist", async () => {
      transactionMock.product.findMany.mockResolvedValue([]);

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_NOT_FOUND" } });

      expect(transactionMock.branchInventory.findUnique).not.toHaveBeenCalled();
    });

    it("rejects when a product in the items list is inactive", async () => {
      transactionMock.product.findMany.mockResolvedValue([
        { ...productRecord, active: false },
      ]);

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_INACTIVE" } });

      expect(transactionMock.branchInventory.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("stock and lot validation", () => {
    it("rejects when the product lot is not found in the origin branch", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "LOT_NOT_FOUND" } });

      expect(transactionMock.branchInventory.update).not.toHaveBeenCalled();
    });

    it("rejects when the origin lot has insufficient stock", async () => {
      transactionMock.branchInventory.findUnique.mockImplementation(({ where }: any) => {
        const { branchId } = where.branchId_productId_expirationDate;
        if (branchId === originBranchId)
          return Promise.resolve({ id: originLotId, quantity: 5 }); // only 5, requesting 10
        return Promise.resolve(null);
      });

      await expect(
        service.createTransfer(validDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "INSUFFICIENT_STOCK" } });

      expect(transactionMock.branchInventory.update).not.toHaveBeenCalled();
    });
  });

  describe("happy path", () => {
    it("decrements the origin lot by the transferred quantity", async () => {
      await service.createTransfer(validDto(), superadminUser);

      expect(transactionMock.branchInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: originLotId },
          data:  { quantity: { decrement: 10 } },
        }),
      );
    });

    it("creates a new destination lot when none exists for that product and expiration date", async () => {
      await service.createTransfer(validDto(), superadminUser);

      expect(transactionMock.branchInventory.create).toHaveBeenCalledWith({
        data: {
          branchId:       destBranchId,
          productId,
          quantity:       10,
          minimumStock:   0,
          expirationDate: expDate,
        },
      });
    });

    it("increments an existing destination lot instead of creating a new one", async () => {
      transactionMock.branchInventory.findUnique.mockImplementation(({ where }: any) => {
        const { branchId } = where.branchId_productId_expirationDate;
        if (branchId === originBranchId) return Promise.resolve({ id: originLotId, quantity: 50 });
        if (branchId === destBranchId)   return Promise.resolve({ id: destLotId });
        return Promise.resolve(null);
      });

      await service.createTransfer(validDto(), superadminUser);

      expect(transactionMock.branchInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: destLotId },
          data:  { quantity: { increment: 10 } },
        }),
      );
      expect(transactionMock.branchInventory.create).not.toHaveBeenCalled();
    });

    it("creates a TRANSFER inventory movement record for each item", async () => {
      await service.createTransfer(validDto(), superadminUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId,
          branchId:       destBranchId,
          originBranchId,
          userId,
          movementType:   "TRANSFER",
          quantity:       10,
        }),
        select: { id: true },
      });
    });

    it("records an audit log with action CREATE and entity INVENTORY_TRANSFER", async () => {
      await service.createTransfer(validDto(), superadminUser, "127.0.0.1");

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action:    "CREATE",
          entity:    "INVENTORY_TRANSFER",
          entityId:  movementId,
          ipAddress: "127.0.0.1",
        }),
        transactionMock,
      );
    });

    it("returns origin branch, destination branch and items in the response", async () => {
      const result = (await service.createTransfer(validDto(), superadminUser)) as any;

      expect(result).toMatchObject({
        originBranch:      { id: originBranchId, name: "Sede Origen"  },
        destinationBranch: { id: destBranchId,   name: "Sede Destino" },
        items: [
          expect.objectContaining({
            id:             movementId,
            productId,
            productName:    "Leche Entera",
            referenceCode:  "LECHE-001",
            unit:           "L",
            quantity:       10,
            expirationDate: EXP_DATE,
            observation:    null,
          }),
        ],
      });
    });

    it("stores the item observation when provided", async () => {
      const dto: CreateTransferDto = {
        ...validDto(),
        items: [{ productId, quantity: 10, expirationDate: EXP_DATE, observation: "Handle with care" }],
      };

      await service.createTransfer(dto, superadminUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ observation: "Handle with care" }),
        }),
      );
    });
  });

  describe("DTO validation", () => {
    it("rejects when originBranchId is missing", async () => {
      await expect(
        validateBody({
          destinationBranchId: destBranchId,
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects when destinationBranchId is missing", async () => {
      await expect(
        validateBody({
          originBranchId,
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects a non-UUID originBranchId", async () => {
      await expect(
        validateBody({
          originBranchId:      "not-a-uuid",
          destinationBranchId: destBranchId,
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects an empty items array", async () => {
      await expect(
        validateBody({ originBranchId, destinationBranchId: destBranchId, items: [] }),
      ).rejects.toThrow();
    });

    it("rejects when item quantity is zero", async () => {
      await expect(
        validateBody({
          originBranchId,
          destinationBranchId: destBranchId,
          items: [{ productId, quantity: 0, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects when item quantity is negative", async () => {
      await expect(
        validateBody({
          originBranchId,
          destinationBranchId: destBranchId,
          items: [{ productId, quantity: -5, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects an invalid expirationDate format", async () => {
      await expect(
        validateBody({
          originBranchId,
          destinationBranchId: destBranchId,
          items: [{ productId, quantity: 5, expirationDate: "not-a-date" }],
        }),
      ).rejects.toThrow();
    });

    it("rejects unknown top-level fields", async () => {
      await expect(
        validateBody({
          originBranchId,
          destinationBranchId: destBranchId,
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
          unexpected: "value",
        }),
      ).rejects.toThrow();
    });
  });
});
