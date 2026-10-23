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
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId       = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originBranchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productId      = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userId         = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const movementId     = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const otherBranchId  = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const movementAt = new Date("2026-10-20T10:00:00.000Z");

const listMovementRecord = {
  id: movementId,
  movementType: "TRANSFER",
  quantity: 10,
  movementAt,
  observation: null,
  product: { id: productId, name: "Leche Entera", referenceCode: "LECHE-001" },
  branch:       { id: branchId,       name: "Sede Centro" },
  originBranch: { id: originBranchId, name: "Sede Origen" },
  user: {
    personId: userId,
    person: { firstName: "Karen", lastName: "Castro" },
  },
};

const detailMovementRecord = {
  ...listMovementRecord,
  product: {
    id: productId,
    name: "Leche Entera",
    referenceCode: "LECHE-001",
    unitOfMeasure: { abreviation: "L" },
  },
};

const prismaMock = {
  $transaction: jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>(),
  inventoryMovement: {
    count:      jest.fn<AsyncMock>(),
    findMany:   jest.fn<AsyncMock>(),
    findUnique: jest.fn<AsyncMock>(),
  },
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

function baseQuery(): ListInventoryMovementsQueryDto {
  return { page: 1, limit: 20 } as ListInventoryMovementsQueryDto;
}

async function validateQuery(query: Record<string, unknown>) {
  return validationPipe.transform(query, {
    type: "query",
    metatype: ListInventoryMovementsQueryDto,
  }) as Promise<ListInventoryMovementsQueryDto>;
}

// ─────────────────────────────────────────────────────────────────────────────
// findAll
// ─────────────────────────────────────────────────────────────────────────────

describe("InventoryMovementsService.findAll", () => {
  let service: InstanceType<typeof InventoryMovementsService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    prismaMock.inventoryMovement.count.mockResolvedValue(1);
    prismaMock.inventoryMovement.findMany.mockResolvedValue([listMovementRecord]);

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

  describe("scope filtering", () => {
    it("SUPERADMIN with no filters uses an empty where clause", async () => {
      await service.findAll(baseQuery(), superadminUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it("SUPERADMIN with branchId filter applies an OR clause", async () => {
      const query = { ...baseQuery(), branchId };

      await service.findAll(query, superadminUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ branchId }, { originBranchId: branchId }],
          }),
        }),
      );
    });

    it("BRANCH_LEADER with no filter scopes the OR to their own branch ids", async () => {
      await service.findAll(baseQuery(), leaderUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { branchId: { in: [branchId] } },
              { originBranchId: { in: [branchId] } },
            ],
          }),
        }),
      );
    });

    it("BRANCH_LEADER with their own branchId filter applies an OR clause", async () => {
      const query = { ...baseQuery(), branchId };

      await service.findAll(query, leaderUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ branchId }, { originBranchId: branchId }],
          }),
        }),
      );
    });

    it("rejects BRANCH_LEADER filtering by a branch they do not own", async () => {
      const query = { ...baseQuery(), branchId: otherBranchId };

      await expect(
        service.findAll(query, leaderUser),
      ).rejects.toMatchObject({ response: { code: "FORBIDDEN_BRANCH" } });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("BRANCH_ASSISTANT with no filter scopes the result to their branches", async () => {
      const assistant: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_ASSISTANT" },
        branches: [{ id: branchId, name: "Sede Centro" }],
      };

      await service.findAll(baseQuery(), assistant);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { branchId: { in: [branchId] } },
              { originBranchId: { in: [branchId] } },
            ],
          }),
        }),
      );
    });
  });

  describe("optional filters", () => {
    it("applies movementType filter to the where clause", async () => {
      const query = { ...baseQuery(), movementType: "TRANSFER" };

      await service.findAll(query, superadminUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ movementType: "TRANSFER" }),
        }),
      );
    });

    it("applies productId filter to the where clause", async () => {
      const query = { ...baseQuery(), productId };

      await service.findAll(query, superadminUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ productId }),
        }),
      );
    });

    it("applies from date filter as movementAt.gte", async () => {
      const query = { ...baseQuery(), from: "2026-01-01" };

      await service.findAll(query, superadminUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            movementAt: expect.objectContaining({
              gte: new Date("2026-01-01T00:00:00Z"),
            }),
          }),
        }),
      );
    });

    it("applies to date filter as movementAt.lte", async () => {
      const query = { ...baseQuery(), to: "2026-12-31" };

      await service.findAll(query, superadminUser);

      expect(prismaMock.inventoryMovement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            movementAt: expect.objectContaining({
              lte: new Date("2026-12-31T23:59:59.999Z"),
            }),
          }),
        }),
      );
    });
  });

  describe("pagination", () => {
    it("calculates skip from page and limit", async () => {
      const query = { ...baseQuery(), page: 3, limit: 10 };

      await service.findAll(query, superadminUser);

      expect(prismaMock.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it("returns totalPages as 0 when total count is 0", async () => {
      prismaMock.inventoryMovement.count.mockResolvedValue(0);
      prismaMock.inventoryMovement.findMany.mockResolvedValue([]);

      const result = (await service.findAll(baseQuery(), superadminUser)) as any;

      expect(result.meta.totalPages).toBe(0);
    });

    it("returns correct totalPages for a non-zero total", async () => {
      prismaMock.inventoryMovement.count.mockResolvedValue(25);

      const result = (await service.findAll({ ...baseQuery(), limit: 10 }, superadminUser)) as any;

      expect(result.meta.totalPages).toBe(3);
    });

    it("includes page, limit and total in the meta", async () => {
      prismaMock.inventoryMovement.count.mockResolvedValue(5);

      const result = (await service.findAll({ ...baseQuery(), page: 2, limit: 10 }, superadminUser)) as any;

      expect(result.meta).toEqual({ page: 2, limit: 10, total: 5, totalPages: 1 });
    });
  });

  describe("response shape", () => {
    it("returns data and meta at the top level", async () => {
      const result = (await service.findAll(baseQuery(), superadminUser)) as any;

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("meta");
    });

    it("maps each movement to the expected fields", async () => {
      const result = (await service.findAll(baseQuery(), superadminUser)) as any;

      expect(result.data[0]).toMatchObject({
        id:           movementId,
        movementType: "TRANSFER",
        quantity:     10,
        movementAt,
        observation:  null,
        product:      { id: productId, name: "Leche Entera", referenceCode: "LECHE-001" },
        branch:       { id: branchId,       name: "Sede Centro" },
        originBranch: { id: originBranchId, name: "Sede Origen" },
        user:         { id: userId, fullName: "Karen Castro" },
      });
    });

    it("sets branch to null when the movement has no destination branch", async () => {
      prismaMock.inventoryMovement.findMany.mockResolvedValue([
        { ...listMovementRecord, branch: null },
      ]);

      const result = (await service.findAll(baseQuery(), superadminUser)) as any;

      expect(result.data[0].branch).toBeNull();
    });

    it("sets originBranch to null for movements without an origin", async () => {
      prismaMock.inventoryMovement.findMany.mockResolvedValue([
        { ...listMovementRecord, originBranch: null },
      ]);

      const result = (await service.findAll(baseQuery(), superadminUser)) as any;

      expect(result.data[0].originBranch).toBeNull();
    });
  });

  describe("query DTO validation", () => {
    it("rejects page = 0", async () => {
      await expect(validateQuery({ page: "0" })).rejects.toThrow();
    });

    it("rejects limit > 100", async () => {
      await expect(validateQuery({ limit: "101" })).rejects.toThrow();
    });

    it("rejects a non-UUID branchId", async () => {
      await expect(validateQuery({ branchId: "not-a-uuid" })).rejects.toThrow();
    });

    it("rejects an invalid movementType value", async () => {
      await expect(validateQuery({ movementType: "INVALID" })).rejects.toThrow();
    });

    it("rejects a from date in wrong format", async () => {
      await expect(validateQuery({ from: "01-01-2026" })).rejects.toThrow();
    });

    it("rejects unknown query fields", async () => {
      await expect(validateQuery({ unexpectedParam: "value" })).rejects.toThrow();
    });

    it("accepts all valid MOVEMENT_TYPE values", async () => {
      for (const type of ["ENTRY", "EXIT", "ADJUSTMENT_ENTRY", "ADJUSTMENT_EXIT", "TRANSFER"]) {
        await expect(validateQuery({ movementType: type })).resolves.toBeDefined();
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findOne
// ─────────────────────────────────────────────────────────────────────────────

describe("InventoryMovementsService.findOne", () => {
  let service: InstanceType<typeof InventoryMovementsService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.inventoryMovement.findUnique.mockResolvedValue(detailMovementRecord);

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

  describe("not found", () => {
    it("throws MOVEMENT_NOT_FOUND when the movement does not exist", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(movementId, superadminUser),
      ).rejects.toMatchObject({ response: { code: "MOVEMENT_NOT_FOUND" } });
    });
  });

  describe("authorization", () => {
    it("allows SUPERADMIN to see any movement", async () => {
      await expect(
        service.findOne(movementId, superadminUser),
      ).resolves.toBeDefined();
    });

    it("allows DEV to see any movement", async () => {
      const dev: AuthenticatedUser = { id: userId, active: true, role: { name: "DEV" } };

      await expect(service.findOne(movementId, dev)).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER when their branch is the destination", async () => {
      await expect(
        service.findOne(movementId, leaderUser),
      ).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER when their branch is the origin", async () => {
      const leader: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_LEADER" },
        branches: [{ id: originBranchId, name: "Sede Origen" }],
      };

      await expect(service.findOne(movementId, leader)).resolves.toBeDefined();
    });

    it("rejects BRANCH_LEADER when their branch is neither origin nor destination", async () => {
      const leader: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_LEADER" },
        branches: [{ id: otherBranchId, name: "Otra Sede" }],
      };

      await expect(
        service.findOne(movementId, leader),
      ).rejects.toMatchObject({ response: { code: "FORBIDDEN_BRANCH" } });
    });

    it("allows BRANCH_ASSISTANT when their branch is involved", async () => {
      const assistant: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "BRANCH_ASSISTANT" },
        branches: [{ id: branchId, name: "Sede Centro" }],
      };

      await expect(service.findOne(movementId, assistant)).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER to see an ENTRY movement with no originBranch", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue({
        ...detailMovementRecord,
        originBranch: null,
      });

      await expect(
        service.findOne(movementId, leaderUser),
      ).resolves.toBeDefined();
    });
  });

  describe("response shape", () => {
    it("returns the expected movement detail fields", async () => {
      const result = (await service.findOne(movementId, superadminUser)) as any;

      expect(result).toMatchObject({
        id:           movementId,
        movementType: "TRANSFER",
        quantity:     10,
        movementAt,
        observation:  null,
        product: {
          id:            productId,
          name:          "Leche Entera",
          referenceCode: "LECHE-001",
          unit:          "L",
        },
        branch:       { id: branchId,       name: "Sede Centro" },
        originBranch: { id: originBranchId, name: "Sede Origen" },
        user:         { id: userId, fullName: "Karen Castro" },
      });
    });

    it("sets originBranch to null for movements without an origin", async () => {
      prismaMock.inventoryMovement.findUnique.mockResolvedValue({
        ...detailMovementRecord,
        originBranch: null,
      });

      const result = (await service.findOne(movementId, superadminUser)) as any;

      expect(result.originBranch).toBeNull();
    });
  });
});
