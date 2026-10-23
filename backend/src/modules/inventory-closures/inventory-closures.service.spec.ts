import "reflect-metadata";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { TestingModule } from "@nestjs/testing";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const closureId = "33333333-3333-4333-8333-333333333333";
const productAId = "44444444-4444-4444-8444-444444444444";
const productBId = "55555555-5555-4555-8555-555555555555";

const today = new Date("2026-10-23T00:00:00.000Z");

const branch = { id: branchId, name: "Sede Centro", active: true };

const productA = {
  name: "Proteína",
  referenceCode: "P-001",
  unitOfMeasure: { abreviation: "kg" },
};
const productB = {
  name: "Creatina",
  referenceCode: "P-002",
  unitOfMeasure: { abreviation: "g" },
};

const inventoryRows = [
  { productId: productAId, quantity: 3, product: productA },
  { productId: productBId, quantity: 5, product: productB },
  { productId: productAId, quantity: 4, product: productA },
];

const closureRecord = {
  id: closureId,
  branchId,
  closureDate: today,
  status: "PENDING",
  confirmed: false,
  locked: false,
  closedAt: null,
  details: [
    {
      productId: productAId,
      physicalQuantity: null,
      observation: null,
      product: productA,
    },
    {
      productId: productBId,
      physicalQuantity: null,
      observation: null,
      product: productB,
    },
  ],
};

const transactionMock = {
  branch: {
    findUnique: jest.fn<AsyncMock>(),
  },
  inventoryClosure: {
    findUnique: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
  branchInventory: {
    findMany: jest.fn<AsyncMock>(),
  },
};

const prismaMock = {
  $transaction:
    jest.fn<
      (
        callback: (client: typeof transactionMock) => Promise<unknown>,
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
const { AuditService } = await import("../audit/audit.service.js");
const { InventoryClosuresService } =
  await import("./inventory-closures.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");

const superadmin: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const userWithRole = (
  roleName: string,
  assignedBranchIds: string[] = [],
): AuthenticatedUser => ({
  id: userId,
  active: true,
  role: { name: roleName },
  branches: assignedBranchIds.map((id) => ({ id, name: "Sede Centro" })),
});

const ipAddress = "127.0.0.1";

describe("InventoryClosuresService.create", () => {
  let service: InstanceType<typeof InventoryClosuresService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date("2026-10-23T15:45:12.000Z") });
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((callback) =>
      callback(transactionMock),
    );
    transactionMock.branch.findUnique.mockResolvedValue(branch);
    transactionMock.inventoryClosure.findUnique.mockResolvedValue(null);
    transactionMock.inventoryClosure.create.mockResolvedValue(closureRecord);
    transactionMock.branchInventory.findMany.mockResolvedValue(inventoryRows);
    auditMock.createAuditLog.mockResolvedValue({});

    testingModule = await Test.createTestingModule({
      providers: [
        InventoryClosuresService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = testingModule.get(InventoryClosuresService);
  });

  afterEach(async () => {
    await testingModule.close();
    jest.useRealTimers();
  });

  it("creates a pending closure for today and returns its items", async () => {
    const result = await service.create(branchId, superadmin, ipAddress);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionMock.inventoryClosure.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId,
          userId,
          closureDate: today,
          status: "PENDING",
          confirmed: false,
          locked: false,
        }),
      }),
    );
    expect(result).toEqual({
      id: closureId,
      branchId,
      closureDate: today,
      status: "PENDING",
      confirmed: false,
      locked: false,
      closedAt: null,
      items: [
        {
          productId: productAId,
          productName: "Proteína",
          referenceCode: "P-001",
          unit: "kg",
          physicalQuantity: null,
          observation: null,
        },
        {
          productId: productBId,
          productName: "Creatina",
          referenceCode: "P-002",
          unit: "g",
          physicalQuantity: null,
          observation: null,
        },
      ],
    });
  });

  it("adds up the lots of the same product into a single detail", async () => {
    await service.create(branchId, superadmin, ipAddress);

    const [{ data }] = transactionMock.inventoryClosure.create.mock
      .calls[0] as [{ data: { details: { create: unknown } } }];
    expect(data.details.create).toEqual([
      { productId: productAId, systemQuantity: 7 },
      { productId: productBId, systemQuantity: 5 },
    ]);
  });

  it("looks up the branch inside the transaction", async () => {
    await service.create(branchId, superadmin, ipAddress);

    expect(transactionMock.branch.findUnique).toHaveBeenCalledWith({
      where: { id: branchId },
      select: { id: true, name: true, active: true },
    });
  });

  it("checks whether the branch already has a closure for today", async () => {
    await service.create(branchId, superadmin, ipAddress);

    expect(transactionMock.inventoryClosure.findUnique).toHaveBeenCalledWith({
      where: { branchId_closureDate: { branchId, closureDate: today } },
      select: { id: true },
    });
  });

  it("reads only the active products of the branch", async () => {
    await service.create(branchId, superadmin, ipAddress);

    expect(transactionMock.branchInventory.findMany).toHaveBeenCalledWith({
      where: { branchId, product: { active: true } },
      select: {
        productId: true,
        quantity: true,
        product: {
          select: {
            name: true,
            referenceCode: true,
            unitOfMeasure: { select: { abreviation: true } },
          },
        },
      },
    });
  });

  it("records the audit log inside the same transaction", async () => {
    await service.create(branchId, superadmin, ipAddress);

    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      {
        userId,
        action: "CREATE",
        entity: "INVENTORY_CLOSURE",
        entityId: closureId,
        newData: {
          branchId,
          closureDate: "2026-10-23",
          itemsCount: 2,
        },
        reason: `Inventory closure created for branch ${branchId}`,
        ipAddress,
      },
      transactionMock,
    );
  });

  it("rejects a branch that does not exist", async () => {
    transactionMock.branch.findUnique.mockResolvedValue(null);

    await expect(
      service.create(branchId, superadmin, ipAddress),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        code: "BRANCH_NOT_FOUND",
        message: "Branch not found.",
      },
    });
    expect(transactionMock.inventoryClosure.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects an inactive branch", async () => {
    transactionMock.branch.findUnique.mockResolvedValue({
      ...branch,
      active: false,
    });

    await expect(
      service.create(branchId, superadmin, ipAddress),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: "BRANCH_INACTIVE",
        message: "Branch is inactive.",
      },
    });
    expect(transactionMock.inventoryClosure.create).not.toHaveBeenCalled();
  });

  it("rejects a second closure for the same branch and date", async () => {
    transactionMock.inventoryClosure.findUnique.mockResolvedValue({
      id: "existing-closure",
    });

    await expect(
      service.create(branchId, superadmin, ipAddress),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: "CLOSURE_ALREADY_EXISTS",
        message: "An inventory closure already exists for this branch today.",
        details: { closureId: "existing-closure" },
      },
    });
    expect(transactionMock.inventoryClosure.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("lets a branch leader create the closure of an assigned branch", async () => {
    const branchLeader = userWithRole("BRANCH_LEADER", [branchId]);

    await expect(
      service.create(branchId, branchLeader, ipAddress),
    ).resolves.toMatchObject({ id: closureId });
  });

  it("rejects a branch leader without access to the branch", async () => {
    const branchLeader = userWithRole("BRANCH_LEADER");

    await expect(
      service.create(branchId, branchLeader, ipAddress),
    ).rejects.toMatchObject({
      status: 403,
      response: {
        code: "FORBIDDEN_BRANCH",
        message: "You do not have access to this branch.",
      },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a branch assistant without access to the branch", async () => {
    const branchAssistant = userWithRole("BRANCH_ASSISTANT", [
      "99999999-9999-4999-8999-999999999999",
    ]);

    await expect(
      service.create(branchId, branchAssistant, ipAddress),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: "FORBIDDEN_BRANCH" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each(["DEV", "SUPERADMIN"])(
    "lets the %s role create without branch assignments",
    async (roleName) => {
      await expect(
        service.create(branchId, userWithRole(roleName), ipAddress),
      ).resolves.toMatchObject({ id: closureId });
    },
  );

  it("creates the closure without details when the branch has no inventory", async () => {
    transactionMock.branchInventory.findMany.mockResolvedValue([]);
    transactionMock.inventoryClosure.create.mockResolvedValue({
      ...closureRecord,
      details: [],
    });

    const result = await service.create(branchId, superadmin, ipAddress);

    const [{ data }] = transactionMock.inventoryClosure.create.mock
      .calls[0] as [{ data: { details: { create: unknown } } }];
    expect(data.details.create).toEqual([]);
    expect(result.items).toEqual([]);
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        newData: {
          branchId,
          closureDate: "2026-10-23",
          itemsCount: 0,
        },
      }),
      transactionMock,
    );
  });

  it("propagates an audit failure", async () => {
    const error = new Error("audit unavailable");
    auditMock.createAuditLog.mockRejectedValue(error);

    await expect(service.create(branchId, superadmin, ipAddress)).rejects.toBe(
      error,
    );
  });
});
