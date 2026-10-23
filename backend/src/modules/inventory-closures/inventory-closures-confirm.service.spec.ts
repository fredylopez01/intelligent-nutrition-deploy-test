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
const detailAId = "66666666-6666-4666-8666-666666666666";
const detailBId = "77777777-7777-4777-8777-777777777777";
const otherBranchId = "99999999-9999-4999-8999-999999999999";

const closureDate = new Date("2026-10-23T00:00:00.000Z");
const confirmedAt = new Date("2026-10-23T15:45:12.000Z");
const ipAddress = "127.0.0.1";

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

const pendingClosure = {
  id: closureId,
  branchId,
  status: "PENDING",
  locked: false,
  details: [
    {
      id: detailAId,
      productId: productAId,
      systemQuantity: 7,
      physicalQuantity: 8,
      difference: 1,
      observation: null,
      product: productA,
    },
    {
      id: detailBId,
      productId: productBId,
      systemQuantity: 5,
      physicalQuantity: 4,
      difference: -1,
      observation: "Vencimiento próximo",
      product: productB,
    },
  ],
};

const confirmedClosureRecord = {
  id: closureId,
  branchId,
  closureDate,
  status: "CONFIRMED",
  confirmed: true,
  locked: true,
  closedAt: confirmedAt,
  details: [
    {
      productId: productAId,
      systemQuantity: 7,
      physicalQuantity: 8,
      difference: 1,
      observation: null,
      product: productA,
    },
    {
      productId: productBId,
      systemQuantity: 5,
      physicalQuantity: 4,
      difference: -1,
      observation: "Vencimiento próximo",
      product: productB,
    },
  ],
};

const transactionMock = {
  inventoryClosure: {
    findUnique: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
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
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { InventoryClosuresService } =
  await import("./inventory-closures.service.js");

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

describe("InventoryClosuresService.confirm", () => {
  let service: InstanceType<typeof InventoryClosuresService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.useFakeTimers({ now: confirmedAt });
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((callback) =>
      callback(transactionMock),
    );
    transactionMock.inventoryClosure.findUnique.mockResolvedValue(
      pendingClosure,
    );
    transactionMock.inventoryClosure.update.mockResolvedValue(
      confirmedClosureRecord,
    );
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

  describe("closure lookup", () => {
    it("rejects when the closure does not exist", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue(null);

      await expect(
        service.confirm(closureId, superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "CLOSURE_NOT_FOUND" },
      });

      expect(transactionMock.inventoryClosure.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("looks up the closure by id inside the transaction", async () => {
      await service.confirm(closureId, superadmin, ipAddress);

      expect(transactionMock.inventoryClosure.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: closureId } }),
      );
    });
  });

  describe("authorization", () => {
    it("allows SUPERADMIN on any branch", async () => {
      await expect(
        service.confirm(closureId, superadmin, ipAddress),
      ).resolves.toBeDefined();
    });

    it("allows DEV on any branch", async () => {
      await expect(
        service.confirm(closureId, userWithRole("DEV"), ipAddress),
      ).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER assigned to the closure branch", async () => {
      const leader = userWithRole("BRANCH_LEADER", [branchId]);

      await expect(
        service.confirm(closureId, leader, ipAddress),
      ).resolves.toBeDefined();
    });

    it("allows BRANCH_ASSISTANT assigned to the closure branch", async () => {
      const assistant = userWithRole("BRANCH_ASSISTANT", [branchId]);

      await expect(
        service.confirm(closureId, assistant, ipAddress),
      ).resolves.toBeDefined();
    });

    it("rejects BRANCH_LEADER not assigned to the closure branch", async () => {
      const leader = userWithRole("BRANCH_LEADER", [otherBranchId]);

      await expect(
        service.confirm(closureId, leader, ipAddress),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: "FORBIDDEN_BRANCH" },
      });

      expect(transactionMock.inventoryClosure.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("rejects BRANCH_ASSISTANT not assigned to the closure branch", async () => {
      const assistant = userWithRole("BRANCH_ASSISTANT");

      await expect(
        service.confirm(closureId, assistant, ipAddress),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: "FORBIDDEN_BRANCH" },
      });

      expect(transactionMock.inventoryClosure.update).not.toHaveBeenCalled();
    });

    it("checks the branch scope before the closure status", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        ...pendingClosure,
        status: "CONFIRMED",
      });
      const leader = userWithRole("BRANCH_LEADER", [otherBranchId]);

      await expect(
        service.confirm(closureId, leader, ipAddress),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: "FORBIDDEN_BRANCH" },
      });
    });
  });

  describe("closure state validation", () => {
    it.each(["CONFIRMED", "NOT_CONFIRMED"])(
      "rejects a closure in %s status",
      async (status) => {
        transactionMock.inventoryClosure.findUnique.mockResolvedValue({
          ...pendingClosure,
          status,
        });

        await expect(
          service.confirm(closureId, superadmin, ipAddress),
        ).rejects.toMatchObject({
          status: 422,
          response: { code: "CLOSURE_NOT_PENDING" },
        });

        expect(transactionMock.inventoryClosure.update).not.toHaveBeenCalled();
        expect(auditMock.createAuditLog).not.toHaveBeenCalled();
      },
    );
  });

  describe("incomplete counts", () => {
    it("rejects when one detail has no physical count", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        ...pendingClosure,
        details: [
          pendingClosure.details[0],
          { ...pendingClosure.details[1], physicalQuantity: null },
        ],
      });

      await expect(
        service.confirm(closureId, superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          code: "COUNTS_INCOMPLETE",
          details: { missingProducts: [productBId] },
        },
      });

      expect(transactionMock.inventoryClosure.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("reports every product missing a count", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        ...pendingClosure,
        details: pendingClosure.details.map((detail) => ({
          ...detail,
          physicalQuantity: null,
        })),
      });

      await expect(
        service.confirm(closureId, superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          code: "COUNTS_INCOMPLETE",
          details: { missingProducts: [productAId, productBId] },
        },
      });
    });
  });

  describe("happy path", () => {
    it("confirms and locks the closure", async () => {
      const result = await service.confirm(closureId, superadmin, ipAddress);

      expect(result).toMatchObject({
        id: closureId,
        branchId,
        status: "CONFIRMED",
        confirmed: true,
        locked: true,
        closedAt: confirmedAt,
      });
    });

    it("saves the confirmed state with the closure timestamp", async () => {
      await service.confirm(closureId, superadmin, ipAddress);

      expect(transactionMock.inventoryClosure.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: closureId },
          data: {
            status: "CONFIRMED",
            confirmed: true,
            locked: true,
            closedAt: confirmedAt,
          },
        }),
      );
    });

    it("returns the differences captured when the counts were saved", async () => {
      const result = await service.confirm(closureId, superadmin, ipAddress);

      expect(
        result.items.find(({ productId }) => productId === productAId),
      ).toMatchObject({
        systemQuantity: 7,
        physicalQuantity: 8,
        difference: 1,
      });
      expect(
        result.items.find(({ productId }) => productId === productBId),
      ).toMatchObject({
        systemQuantity: 5,
        physicalQuantity: 4,
        difference: -1,
      });
    });

    it("maps the product data into the response items", async () => {
      const result = await service.confirm(closureId, superadmin, ipAddress);

      expect(result.items).toEqual([
        {
          productId: productAId,
          productName: "Proteína",
          referenceCode: "P-001",
          unit: "kg",
          systemQuantity: 7,
          physicalQuantity: 8,
          difference: 1,
          observation: null,
        },
        {
          productId: productBId,
          productName: "Creatina",
          referenceCode: "P-002",
          unit: "g",
          systemQuantity: 5,
          physicalQuantity: 4,
          difference: -1,
          observation: "Vencimiento próximo",
        },
      ]);
    });

    it("records the confirmation in the audit log within the transaction", async () => {
      await service.confirm(closureId, superadmin, ipAddress);

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: "UPDATE",
          entity: "INVENTORY_CLOSURE",
          entityId: closureId,
          newData: {
            status: "CONFIRMED",
            confirmedAt: confirmedAt.toISOString(),
          },
          reason: `Inventory closure ${closureId} confirmed`,
          ipAddress,
        }),
        transactionMock,
      );
    });

    it("confirms a closure without details", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        ...pendingClosure,
        details: [],
      });
      transactionMock.inventoryClosure.update.mockResolvedValue({
        ...confirmedClosureRecord,
        details: [],
      });

      const result = await service.confirm(closureId, superadmin, ipAddress);

      expect(result.items).toEqual([]);
      expect(result.status).toBe("CONFIRMED");
    });

    it("propagates an audit failure", async () => {
      const error = new Error("audit unavailable");
      auditMock.createAuditLog.mockRejectedValue(error);

      await expect(
        service.confirm(closureId, superadmin, ipAddress),
      ).rejects.toBe(error);
    });
  });
});
