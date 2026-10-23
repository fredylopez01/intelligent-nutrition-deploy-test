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
import {
  CreateMovementDto,
  DirectMovementType,
} from "./dto/create-movement.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionCallback = (client: typeof transactionMock) => Promise<unknown>;

const branchId   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productId  = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId     = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const movementId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const lotId      = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const EXP_DATE = "2027-12-31";
const expDate  = new Date(EXP_DATE);

const branchRecord = { id: branchId, name: "Sede Centro", active: true };
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
  branches: [{ id: branchId, name: "Sede Centro" }],
};

function validEntryDto(): CreateMovementDto {
  return {
    branchId,
    movementType: DirectMovementType.ENTRY,
    items: [{ productId, quantity: 10, expirationDate: EXP_DATE }],
  } as CreateMovementDto;
}

function validExitDto(): CreateMovementDto {
  return {
    branchId,
    movementType: DirectMovementType.EXIT,
    items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
  } as CreateMovementDto;
}

async function validateBody(body: Record<string, unknown>) {
  return validationPipe.transform(body, {
    type: "body",
    metatype: CreateMovementDto,
  }) as Promise<CreateMovementDto>;
}

describe("InventoryMovementsService.createMovement", () => {
  let service: InstanceType<typeof InventoryMovementsService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((op) => op(transactionMock));

    transactionMock.branch.findUnique.mockResolvedValue(branchRecord);
    transactionMock.product.findMany.mockResolvedValue([productRecord]);
    transactionMock.$queryRaw.mockResolvedValue([]);

    transactionMock.branchInventory.findUnique.mockResolvedValue(
      { id: lotId, quantity: 50 },
    );
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
    it("allows SUPERADMIN to register movements for any branch", async () => {
      await expect(
        service.createMovement(validEntryDto(), superadminUser),
      ).resolves.toBeDefined();
    });

    it("allows DEV to register movements for any branch", async () => {
      const dev: AuthenticatedUser = { id: userId, active: true, role: { name: "DEV" } };

      await expect(
        service.createMovement(validEntryDto(), dev),
      ).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER assigned to the branch", async () => {
      await expect(
        service.createMovement(validEntryDto(), leaderUser),
      ).resolves.toBeDefined();
    });

    it("rejects BRANCH_LEADER not assigned to the branch", async () => {
      const leader: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_LEADER" },
        branches: [{ id: "99999999-9999-4999-8999-999999999999", name: "Otra Sede" }],
      };

      await expect(
        service.createMovement(validEntryDto(), leader),
      ).rejects.toMatchObject({ response: { code: "FORBIDDEN_BRANCH" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects BRANCH_ASSISTANT without access to the branch", async () => {
      const assistant: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_ASSISTANT" },
        branches: [],
      };

      await expect(
        service.createMovement(validEntryDto(), assistant),
      ).rejects.toMatchObject({ response: { code: "FORBIDDEN_BRANCH" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("pre-transaction validation", () => {
    it("rejects when items contain duplicate product and expiration date", async () => {
      const dto: CreateMovementDto = {
        ...validEntryDto(),
        items: [
          { productId, quantity: 5,  expirationDate: EXP_DATE },
          { productId, quantity: 10, expirationDate: EXP_DATE },
        ],
      };

      await expect(
        service.createMovement(dto, superadminUser),
      ).rejects.toMatchObject({ response: { code: "DUPLICATED_ITEM" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("allows two items with the same product but different expiration dates", async () => {
      const dto: CreateMovementDto = {
        ...validEntryDto(),
        items: [
          { productId, quantity: 5, expirationDate: "2027-12-31" },
          { productId, quantity: 5, expirationDate: "2028-06-30" },
        ],
      };

      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await expect(
        service.createMovement(dto, superadminUser),
      ).resolves.toBeDefined();
    });
  });

  describe("branch validation", () => {
    it("rejects when the branch does not exist", async () => {
      transactionMock.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.createMovement(validEntryDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "BRANCH_NOT_FOUND" } });

      expect(transactionMock.product.findMany).not.toHaveBeenCalled();
    });

    it("rejects when the branch is inactive", async () => {
      transactionMock.branch.findUnique.mockResolvedValue({
        ...branchRecord,
        active: false,
      });

      await expect(
        service.createMovement(validEntryDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "BRANCH_INACTIVE" } });

      expect(transactionMock.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe("product validation", () => {
    it("rejects when a product does not exist", async () => {
      transactionMock.product.findMany.mockResolvedValue([]);

      await expect(
        service.createMovement(validEntryDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_NOT_FOUND" } });

      expect(transactionMock.branchInventory.findUnique).not.toHaveBeenCalled();
    });

    it("rejects when a product is inactive", async () => {
      transactionMock.product.findMany.mockResolvedValue([
        { ...productRecord, active: false },
      ]);

      await expect(
        service.createMovement(validEntryDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_INACTIVE" } });

      expect(transactionMock.branchInventory.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("EXIT — stock and lot validation", () => {
    it("rejects when the lot is not found in the branch", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await expect(
        service.createMovement(validExitDto(), superadminUser),
      ).rejects.toMatchObject({ response: { code: "LOT_NOT_FOUND" } });

      expect(transactionMock.branchInventory.update).not.toHaveBeenCalled();
    });

    it("rejects when the lot has insufficient stock", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue({
        id: lotId,
        quantity: 3,
      });

      const dto: CreateMovementDto = {
        ...validExitDto(),
        items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
      };

      await expect(
        service.createMovement(dto, superadminUser),
      ).rejects.toMatchObject({ response: { code: "INSUFFICIENT_STOCK" } });

      expect(transactionMock.branchInventory.update).not.toHaveBeenCalled();
    });
  });

  describe("EXIT — happy path", () => {
    it("calls $queryRaw FOR UPDATE before reading the lot", async () => {
      await service.createMovement(validExitDto(), superadminUser);

      expect(transactionMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("decrements the lot by the exit quantity", async () => {
      await service.createMovement(validExitDto(), superadminUser);

      expect(transactionMock.branchInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: lotId },
          data:  { quantity: { decrement: 5 } },
        }),
      );
    });

    it("creates an EXIT inventory movement record", async () => {
      await service.createMovement(validExitDto(), superadminUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId,
          branchId,
          userId,
          movementType: "EXIT",
          quantity:     5,
        }),
        select: { id: true },
      });
    });

    it("returns movementType EXIT in the response", async () => {
      const result = (await service.createMovement(validExitDto(), superadminUser)) as any;

      expect(result.movementType).toBe(DirectMovementType.EXIT);
    });
  });

  describe("ENTRY — happy path", () => {
    it("does not call $queryRaw FOR UPDATE for ENTRY movements", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await service.createMovement(validEntryDto(), superadminUser);

      expect(transactionMock.$queryRaw).not.toHaveBeenCalled();
    });

    it("creates a new lot when none exists for that product and expiration date", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await service.createMovement(validEntryDto(), superadminUser);

      expect(transactionMock.branchInventory.create).toHaveBeenCalledWith({
        data: {
          branchId,
          productId,
          quantity:       10,
          minimumStock:   0,
          expirationDate: expDate,
        },
      });
    });

    it("increments an existing lot instead of creating a new one", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue({ id: lotId });

      await service.createMovement(validEntryDto(), superadminUser);

      expect(transactionMock.branchInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: lotId },
          data:  { quantity: { increment: 10 } },
        }),
      );
      expect(transactionMock.branchInventory.create).not.toHaveBeenCalled();
    });

    it("creates an ENTRY inventory movement record", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await service.createMovement(validEntryDto(), superadminUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId,
          branchId,
          userId,
          movementType: "ENTRY",
          quantity:     10,
        }),
        select: { id: true },
      });
    });

    it("returns movementType ENTRY in the response", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      const result = (await service.createMovement(validEntryDto(), superadminUser)) as any;

      expect(result.movementType).toBe(DirectMovementType.ENTRY);
    });
  });

  describe("observation fallback", () => {
    it("uses item observation when both item and global observation are provided", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      const dto: CreateMovementDto = {
        branchId,
        movementType: DirectMovementType.ENTRY,
        observation:  "Global note",
        items: [{ productId, quantity: 10, expirationDate: EXP_DATE, observation: "Item note" }],
      } as CreateMovementDto;

      await service.createMovement(dto, superadminUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ observation: "Item note" }),
        }),
      );
    });

    it("falls back to global observation when item has none", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      const dto: CreateMovementDto = {
        branchId,
        movementType: DirectMovementType.ENTRY,
        observation:  "Global note",
        items: [{ productId, quantity: 10, expirationDate: EXP_DATE }],
      } as CreateMovementDto;

      await service.createMovement(dto, superadminUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ observation: "Global note" }),
        }),
      );
    });

    it("stores null observation when neither item nor global observation is provided", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await service.createMovement(validEntryDto(), superadminUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ observation: null }),
        }),
      );
    });
  });

  describe("shared happy path", () => {
    it("records an audit log with action CREATE and entity INVENTORY_MOVEMENT", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      await service.createMovement(validEntryDto(), superadminUser, "127.0.0.1");

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action:    "CREATE",
          entity:    "INVENTORY_MOVEMENT",
          entityId:  movementId,
          ipAddress: "127.0.0.1",
        }),
        transactionMock,
      );
    });

    it("returns branch info, movementType and items in the response", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue(null);

      const result = (await service.createMovement(validEntryDto(), superadminUser)) as any;

      expect(result).toMatchObject({
        branch:       { id: branchId, name: "Sede Centro" },
        movementType: DirectMovementType.ENTRY,
        items: [
          expect.objectContaining({
            id:             movementId,
            productId,
            productName:    "Leche Entera",
            referenceCode:  "LECHE-001",
            unit:           "L",
            quantity:       10,
            expirationDate: EXP_DATE,
          }),
        ],
      });
    });
  });

  describe("DTO validation", () => {
    it("rejects when branchId is missing", async () => {
      await expect(
        validateBody({
          movementType: "ENTRY",
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects a non-UUID branchId", async () => {
      await expect(
        validateBody({
          branchId:    "not-a-uuid",
          movementType: "ENTRY",
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects an invalid movementType", async () => {
      await expect(
        validateBody({
          branchId,
          movementType: "TRANSFER",
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects an empty items array", async () => {
      await expect(
        validateBody({ branchId, movementType: "ENTRY", items: [] }),
      ).rejects.toThrow();
    });

    it("rejects when item quantity is zero", async () => {
      await expect(
        validateBody({
          branchId,
          movementType: "ENTRY",
          items: [{ productId, quantity: 0, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects when item quantity is negative", async () => {
      await expect(
        validateBody({
          branchId,
          movementType: "EXIT",
          items: [{ productId, quantity: -3, expirationDate: EXP_DATE }],
        }),
      ).rejects.toThrow();
    });

    it("rejects an invalid expirationDate format", async () => {
      await expect(
        validateBody({
          branchId,
          movementType: "ENTRY",
          items: [{ productId, quantity: 5, expirationDate: "31/12/2027" }],
        }),
      ).rejects.toThrow();
    });

    it("rejects unknown top-level fields", async () => {
      await expect(
        validateBody({
          branchId,
          movementType: "ENTRY",
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
          unexpected: "value",
        }),
      ).rejects.toThrow();
    });

    it("accepts both ENTRY and EXIT as valid movementType values", async () => {
      for (const type of ["ENTRY", "EXIT"]) {
        await expect(
          validateBody({
            branchId,
            movementType: type,
            items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
          }),
        ).resolves.toBeDefined();
      }
    });
  });
});
