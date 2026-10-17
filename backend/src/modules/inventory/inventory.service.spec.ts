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
import { AssignProductDto } from "./dto/assign-product.dto.js";
import { UpdateMinimumStockDto } from "./dto/update-minimunstock.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionCallback = (client: typeof transactionMock) => Promise<unknown>;

const branchId    = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productId   = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId      = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const inventoryId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const categoryId  = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const updatedAt   = new Date("2026-10-16T12:00:00.000Z");

const transactionMock = {
  branch: {
    findUnique: jest.fn<AsyncMock>(),
  },
  product: {
    findUnique: jest.fn<AsyncMock>(),
  },
  branchInventory: {
    findUnique: jest.fn<AsyncMock>(),
    findFirst: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    updateMany: jest.fn<AsyncMock>(),
    findFirstOrThrow: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
  inventoryMovement: {
    create: jest.fn<AsyncMock>(),
  },
  $queryRaw: jest.fn<AsyncMock>(),
};

const prismaMock = {
  $transaction: jest.fn<(operation: TransactionCallback) => Promise<unknown>>(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { InventoryService } = await import("./inventory.service.js");

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const currentUser: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const inventoryLots = [
  {
    id: "lot-one",
    quantity: 3,
    minimumStock: 5,
    expirationDate: new Date("2027-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-10T00:00:00.000Z"),
  },
  {
    id: "lot-two",
    quantity: 4,
    minimumStock: 5,
    expirationDate: new Date("2027-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-11T00:00:00.000Z"),
  },
];

async function validateBody(body: Record<string, unknown>) {
  return validationPipe.transform(body, {
    type: "body",
    metatype: UpdateMinimumStockDto,
  }) as Promise<UpdateMinimumStockDto>;
}

async function validateAssignBody(body: Record<string, unknown>) {
  return validationPipe.transform(body, {
    type: "body",
    metatype: AssignProductDto,
  }) as Promise<AssignProductDto>;
}

describe("InventoryService.updateMinimumStock", () => {
  let service: InstanceType<typeof InventoryService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(transactionMock),
    );
    transactionMock.branch.findUnique.mockResolvedValue({
      id: branchId,
      name: "Sede Centro",
      active: true,
    });
    transactionMock.branchInventory.findMany.mockResolvedValue(inventoryLots);
    transactionMock.branchInventory.updateMany.mockResolvedValue({ count: 2 });
    transactionMock.branchInventory.findFirstOrThrow.mockResolvedValue({
      updatedAt,
    });
    auditMock.createAuditLog.mockResolvedValue({});

    testingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = testingModule.get(InventoryService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  it("updates minimum stock for all lots and records the audit log", async () => {
    const dto = await validateBody({ minimumStock: 10 });

    const result = await service.updateMinimumStock(
      branchId,
      productId,
      dto,
      currentUser,
      "127.0.0.1",
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionMock.branch.findUnique).toHaveBeenCalledWith({
      where: { id: branchId },
      select: { id: true, name: true, active: true },
    });
    expect(transactionMock.branchInventory.findMany).toHaveBeenCalledWith({
      where: { branchId, productId },
      select: {
        id: true,
        quantity: true,
        minimumStock: true,
        expirationDate: true,
        updatedAt: true,
      },
      orderBy: { expirationDate: "asc" },
    });
    expect(transactionMock.branchInventory.updateMany).toHaveBeenCalledWith({
      where: { branchId, productId },
      data: { minimumStock: 10 },
    });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      {
        userId,
        action: "UPDATE",
        entity: "branch_inventory",
        entityId: productId,
        oldData: {
          branchId,
          productId,
          minimumStock: 5,
          totalQuantity: 7,
          lowStock: false,
        },
        newData: {
          branchId,
          productId,
          minimumStock: 10,
          totalQuantity: 7,
          lowStock: true,
        },
        reason: "Minimum stock updated to 10 for product in branch",
        ipAddress: "127.0.0.1",
      },
      transactionMock,
    );
    expect(result).toEqual({
      data: {
        branchId,
        productId,
        minimumStock: 10,
        totalQuantity: 7,
        lowStock: true,
        lotsUpdated: 2,
        lots: inventoryLots.map(({ id, quantity, expirationDate }) => ({
          id,
          quantity,
          expirationDate,
        })),
        updatedAt,
      },
    });
  });

  it("rejects a negative minimum stock value", async () => {
    await expect(validateBody({ minimumStock: -1 })).rejects.toThrow();

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.branchInventory.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a quantity field instead of accepting it as a minimum stock update", async () => {
    await expect(
      validateBody({ minimumStock: 10, quantity: 100 }),
    ).rejects.toThrow();

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.branchInventory.updateMany).not.toHaveBeenCalled();
  });

  it("rejects updates for an inactive branch", async () => {
    transactionMock.branch.findUnique.mockResolvedValue({
      id: branchId,
      name: "Sede inactiva",
      active: false,
    });
    const dto = await validateBody({ minimumStock: 10 });

    await expect(
      service.updateMinimumStock(branchId, productId, dto, currentUser),
    ).rejects.toMatchObject({
      response: { code: "BRANCH_INACTIVE" },
    });

    expect(transactionMock.branchInventory.findMany).not.toHaveBeenCalled();
    expect(transactionMock.branchInventory.updateMany).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });
});

describe("InventoryService.assignProductToBranch", () => {
  let service: InstanceType<typeof InventoryService>;
  let testingModule: TestingModule;

  const expirationDateStr = "2027-06-30";
  const expirationDate = new Date("2027-06-30");

  const productRecord = {
    id: productId,
    name: "Leche Entera",
    referenceCode: "LECHE-001",
    active: true,
    price: { toFixed: (_n: number) => "12500.50" },
    category: { id: categoryId, name: "Lácteos" },
    unitOfMeasure: { abreviation: "L" },
  };

  const inventoryRecord = {
    id: inventoryId,
    branchId,
    productId,
    quantity: 10,
    minimumStock: 5,
    expirationDate,
    createdAt: new Date("2026-10-16T00:00:00.000Z"),
    updatedAt: new Date("2026-10-16T00:00:00.000Z"),
  };

  const validDto = (): AssignProductDto =>
    ({
      productId,
      quantity: 10,
      minimumStock: 5,
      expirationDate: expirationDateStr,
    }) as AssignProductDto;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(transactionMock),
    );
    transactionMock.branch.findUnique.mockResolvedValue({
      id: branchId,
      name: "Sede Centro",
      active: true,
    });
    transactionMock.product.findUnique.mockResolvedValue(productRecord);
    transactionMock.$queryRaw.mockResolvedValue([]);
    transactionMock.branchInventory.findUnique.mockResolvedValue(null);
    transactionMock.branchInventory.findFirst.mockResolvedValue(null);
    transactionMock.branchInventory.create.mockResolvedValue(inventoryRecord);
    transactionMock.branchInventory.findMany.mockResolvedValue([inventoryRecord]);
    transactionMock.inventoryMovement.create.mockResolvedValue({});
    auditMock.createAuditLog.mockResolvedValue({});

    testingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = testingModule.get(InventoryService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  describe("authorization", () => {
    it("allows SUPERADMIN to assign to any branch", async () => {
      await expect(
        service.assignProductToBranch(branchId, validDto(), currentUser),
      ).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER with access to the branch", async () => {
      const leader: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_LEADER" },
        branches: [{ id: branchId, name: "Sede Centro" }],
      };

      await expect(
        service.assignProductToBranch(branchId, validDto(), leader),
      ).resolves.toBeDefined();
    });

    it("rejects BRANCH_LEADER without access to the branch", async () => {
      const leader: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_LEADER" },
        branches: [],
      };

      await expect(
        service.assignProductToBranch(branchId, validDto(), leader),
      ).rejects.toMatchObject({ response: { code: "BRANCH_OUT_OF_SCOPE" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects roles without branch scope", async () => {
      const assistant: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_ASSISTANT" },
      };

      await expect(
        service.assignProductToBranch(branchId, validDto(), assistant),
      ).rejects.toMatchObject({ response: { code: "FORBIDDEN" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("branch and product validation", () => {
    it("rejects a missing branch", async () => {
      transactionMock.branch.findUnique.mockResolvedValue(null);

      await expect(
        service.assignProductToBranch(branchId, validDto(), currentUser),
      ).rejects.toMatchObject({ response: { code: "BRANCH_NOT_FOUND" } });

      expect(transactionMock.product.findUnique).not.toHaveBeenCalled();
    });

    it("rejects an inactive branch", async () => {
      transactionMock.branch.findUnique.mockResolvedValue({
        id: branchId,
        name: "Sede inactiva",
        active: false,
      });

      await expect(
        service.assignProductToBranch(branchId, validDto(), currentUser),
      ).rejects.toMatchObject({ response: { code: "BRANCH_INACTIVE" } });

      expect(transactionMock.product.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a missing product", async () => {
      transactionMock.product.findUnique.mockResolvedValue(null);

      await expect(
        service.assignProductToBranch(branchId, validDto(), currentUser),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_NOT_FOUND" } });

      expect(transactionMock.branchInventory.findUnique).not.toHaveBeenCalled();
    });

    it("rejects an inactive product", async () => {
      transactionMock.product.findUnique.mockResolvedValue({
        ...productRecord,
        active: false,
      });

      await expect(
        service.assignProductToBranch(branchId, validDto(), currentUser),
      ).rejects.toMatchObject({ response: { code: "PRODUCT_INACTIVE" } });

      expect(transactionMock.branchInventory.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a product already assigned with the same expiration date", async () => {
      transactionMock.branchInventory.findUnique.mockResolvedValue({
        id: inventoryId,
      });

      await expect(
        service.assignProductToBranch(branchId, validDto(), currentUser),
      ).rejects.toMatchObject({
        response: { code: "PRODUCT_ALREADY_ASSIGNED" },
      });

      expect(transactionMock.branchInventory.create).not.toHaveBeenCalled();
    });
  });

  describe("creation", () => {
    it("uses dto.minimumStock for the first lot when no prior lot exists", async () => {
      transactionMock.branchInventory.findFirst.mockResolvedValue(null);

      const result = await service.assignProductToBranch(
        branchId,
        validDto(),
        currentUser,
      );

      expect(transactionMock.branchInventory.create).toHaveBeenCalledWith({
        data: {
          branchId,
          productId,
          quantity: 10,
          minimumStock: 5,
          expirationDate,
        },
      });
      expect(result.data.minimumStock).toBe(5);
    });

    it("inherits minimumStock from an existing lot, ignoring dto.minimumStock", async () => {
      transactionMock.branchInventory.findFirst.mockResolvedValue({
        minimumStock: 20,
      });

      const result = await service.assignProductToBranch(
        branchId,
        validDto(),
        currentUser,
      );

      expect(transactionMock.branchInventory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ minimumStock: 20 }),
        }),
      );
      expect(result.data.minimumStock).toBe(20);
    });

    it("creates an inventory movement with TRANSFER when quantity is greater than zero", async () => {
      await service.assignProductToBranch(branchId, validDto(), currentUser);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId,
          branchId,
          userId,
          movementType: "TRANSFER",
          quantity: 10,
        }),
      });
    });

    it("does not create an inventory movement when quantity is zero", async () => {
      const dto = { ...validDto(), quantity: 0 } as AssignProductDto;
      transactionMock.branchInventory.create.mockResolvedValue({
        ...inventoryRecord,
        quantity: 0,
      });
      transactionMock.branchInventory.findMany.mockResolvedValue([
        { quantity: 0, minimumStock: 5 },
      ]);

      await service.assignProductToBranch(branchId, dto, currentUser);

      expect(transactionMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("records an audit log with action ASSIGN and the correct entity", async () => {
      await service.assignProductToBranch(
        branchId,
        validDto(),
        currentUser,
        "127.0.0.1",
      );

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: "ASSIGN",
          entity: "branch_inventory",
          entityId: inventoryId,
          ipAddress: "127.0.0.1",
        }),
        transactionMock,
      );
    });

    it("returns lowStock true when total quantity is below minimum stock", async () => {
      transactionMock.branchInventory.create.mockResolvedValue({
        ...inventoryRecord,
        quantity: 3,
        minimumStock: 5,
      });
      transactionMock.branchInventory.findMany.mockResolvedValue([
        { quantity: 3, minimumStock: 5 },
      ]);

      const result = await service.assignProductToBranch(
        branchId,
        validDto(),
        currentUser,
      );

      expect(result.data.lowStock).toBe(true);
    });

    it("returns lowStock false when total quantity meets minimum stock", async () => {
      transactionMock.branchInventory.findMany.mockResolvedValue([
        { quantity: 10, minimumStock: 5 },
      ]);

      const result = await service.assignProductToBranch(
        branchId,
        validDto(),
        currentUser,
      );

      expect(result.data.lowStock).toBe(false);
    });

    it("formats the product price with two decimal places", async () => {
      const result = await service.assignProductToBranch(
        branchId,
        validDto(),
        currentUser,
      );

      expect(result.data.product.price).toBe("12500.50");
    });
  });

  describe("DTO validation", () => {
    it("rejects a non-UUID productId", async () => {
      await expect(
        validateAssignBody({
          productId: "not-a-uuid",
          quantity: 5,
          expirationDate: expirationDateStr,
        }),
      ).rejects.toThrow();
    });

    it("rejects a negative quantity", async () => {
      await expect(
        validateAssignBody({
          productId,
          quantity: -1,
          expirationDate: expirationDateStr,
        }),
      ).rejects.toThrow();
    });

    it("rejects an invalid expirationDate format", async () => {
      await expect(
        validateAssignBody({
          productId,
          quantity: 5,
          expirationDate: "not-a-date",
        }),
      ).rejects.toThrow();
    });

    it("rejects unknown fields", async () => {
      await expect(
        validateAssignBody({
          productId,
          quantity: 5,
          expirationDate: expirationDateStr,
          unknownField: true,
        }),
      ).rejects.toThrow();
    });
  });
});
