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
import { UpdateMinimumStockDto } from "./dto/update-minimunstock.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionCallback = (client: typeof transactionMock) => Promise<unknown>;

const branchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const productId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const updatedAt = new Date("2026-10-16T12:00:00.000Z");

const transactionMock = {
  branch: {
    findUnique: jest.fn<AsyncMock>(),
  },
  branchInventory: {
    findMany: jest.fn<AsyncMock>(),
    updateMany: jest.fn<AsyncMock>(),
    findFirstOrThrow: jest.fn<AsyncMock>(),
  },
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
