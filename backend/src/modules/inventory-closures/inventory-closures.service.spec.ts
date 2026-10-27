import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { InventoryClosuresService } from "./inventory-closures.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "11111111-1111-4111-8111-111111111111";
const otherBranchId = "44444444-4444-4444-8444-444444444444";
const closureId = "33333333-3333-4333-8333-333333333333";
const wheyId = "55555555-5555-4555-8555-555555555555";
const creatineId = "66666666-6666-4666-8666-666666666666";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const leader: AuthenticatedUser = {
  id: "leader-id",
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: branchId, name: "Centro" }],
};
const assistant: AuthenticatedUser = {
  id: "assistant-id",
  active: true,
  role: { name: "BRANCH_ASSISTANT" },
  branches: [{ id: branchId, name: "Centro" }],
};
const superadmin: AuthenticatedUser = {
  id: "admin-id",
  active: true,
  role: { name: "SUPERADMIN" },
};
const outsider: AuthenticatedUser = {
  id: "outsider-id",
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: otherBranchId, name: "Norte" }],
};

const tx = {
  branch: { findUnique: jest.fn<AsyncMock>() },
  inventoryClosure: {
    findUnique: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
  branchInventory: { findMany: jest.fn<AsyncMock>() },
};
const prisma = {
  $transaction: jest.fn<(arg: unknown) => Promise<unknown>>(),
  inventoryClosure: {
    findUnique: jest.fn<AsyncMock>(),
    count: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
  },
};
const audit = { createAuditLog: jest.fn<AsyncMock>() };

function detail(
  productId: string,
  name: string,
  expirationDate: string,
  values: Partial<{
    systemQuantity: number;
    physicalQuantity: number | null;
    difference: number | null;
  }> = {},
) {
  return {
    id: `${productId}-${expirationDate}`,
    productId,
    expirationDate: day(expirationDate),
    systemQuantity: values.systemQuantity ?? 10,
    physicalQuantity: values.physicalQuantity ?? null,
    difference: values.difference ?? null,
    observation: null,
    product: {
      name,
      referenceCode: name.toUpperCase().slice(0, 5),
      unitOfMeasure: { abreviation: "und" },
    },
  };
}

function closureRow(
  status: "PENDING" | "CONFIRMED" | "NOT_CONFIRMED",
  details = [
    detail(wheyId, "Whey", "2027-06-30", {
      systemQuantity: 8,
      physicalQuantity: 7,
      difference: -1,
    }),
    detail(creatineId, "Creatina", "2027-01-31", {
      systemQuantity: 5,
      physicalQuantity: 5,
      difference: 0,
    }),
  ],
) {
  return {
    id: closureId,
    branchId,
    closureDate: day("2026-10-26"),
    status,
    confirmed: status === "CONFIRMED",
    locked: status !== "PENDING",
    closedAt: status === "PENDING" ? null : new Date("2026-10-27T01:00:00Z"),
    branch: { name: "Centro" },
    user: { person: { firstName: "Laura", lastName: "Pérez" } },
    details,
  };
}

describe("InventoryClosuresService", () => {
  let service: InventoryClosuresService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-27T03:00:00.000Z") });
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg) =>
      typeof arg === "function"
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    );
    tx.branch.findUnique.mockResolvedValue({ id: branchId, active: true });
    tx.inventoryClosure.findUnique.mockResolvedValue(null);
    tx.branchInventory.findMany.mockResolvedValue([
      { productId: wheyId, expirationDate: day("2027-06-30"), quantity: 8 },
      { productId: wheyId, expirationDate: day("2026-09-30"), quantity: 2 },
    ]);
    tx.inventoryClosure.create.mockResolvedValue(
      closureRow("PENDING", [
        detail(wheyId, "Whey", "2027-06-30", { systemQuantity: 8 }),
        detail(wheyId, "Whey", "2026-09-30", { systemQuantity: 2 }),
      ]),
    );
    service = new InventoryClosuresService(prisma as never, audit as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("create", () => {
    it("snapshots every lot with units of the active products, expired lots included", async () => {
      await service.create(branchId, leader);

      expect(tx.branchInventory.findMany).toHaveBeenCalledWith({
        where: { branchId, quantity: { gt: 0 }, product: { active: true } },
        select: { productId: true, expirationDate: true, quantity: true },
      });
      const [args] = tx.inventoryClosure.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(args.data).toMatchObject({
        branchId,
        userId: "leader-id",
        closureDate: day("2026-10-26"),
        status: "PENDING",
        details: {
          create: [
            {
              productId: wheyId,
              expirationDate: day("2027-06-30"),
              systemQuantity: 8,
            },
            {
              productId: wheyId,
              expirationDate: day("2026-09-30"),
              systemQuantity: 2,
            },
          ],
        },
      });
    });

    it("uses the Bogota business date, not the UTC date", async () => {
      await service.create(branchId, assistant);

      expect(tx.inventoryClosure.findUnique).toHaveBeenCalledWith({
        where: {
          branchId_closureDate: { branchId, closureDate: day("2026-10-26") },
        },
        select: { id: true },
      });
    });

    it("returns the lots to count without the system quantity", async () => {
      const result = await service.create(branchId, leader);

      expect(result).toMatchObject({
        id: closureId,
        branchName: "Centro",
        closureDate: "2026-10-26",
        status: "PENDING",
        userName: "Laura Pérez",
        countedItems: 0,
        totalItems: 2,
      });
      expect(result.items.map((item) => item.expirationDate)).toEqual([
        "2026-09-30",
        "2027-06-30",
      ]);
      expect(result.items[0]).not.toHaveProperty("systemQuantity");
      expect(result).not.toHaveProperty("totalDifferences");
    });

    it("rejects a second closure of the day with its id", async () => {
      tx.inventoryClosure.findUnique.mockResolvedValue({ id: closureId });

      await expect(service.create(branchId, leader)).rejects.toMatchObject({
        response: {
          code: "CLOSURE_ALREADY_EXISTS",
          details: { closureId },
        },
      });
      expect(tx.inventoryClosure.create).not.toHaveBeenCalled();
    });

    it("rejects an inactive branch", async () => {
      tx.branch.findUnique.mockResolvedValue({ id: branchId, active: false });

      await expect(service.create(branchId, leader)).rejects.toMatchObject({
        response: { code: "BRANCH_INACTIVE" },
      });
    });

    it("rejects a branch that does not exist", async () => {
      tx.branch.findUnique.mockResolvedValue(null);

      await expect(service.create(branchId, leader)).rejects.toMatchObject({
        response: { code: "BRANCH_NOT_FOUND" },
      });
    });

    it("rejects a branch outside the assignment", async () => {
      await expect(service.create(branchId, outsider)).rejects.toMatchObject({
        response: { code: "BRANCH_SCOPE_VIOLATION" },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("does not write audit logs when starting the closure", async () => {
      await service.create(branchId, leader);

      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("findOne and the blind count", () => {
    it("never reveals the system quantity while the closure is pending, not even to the superadmin", async () => {
      prisma.inventoryClosure.findUnique.mockResolvedValue(
        closureRow("PENDING"),
      );

      const result = await service.findOne(closureId, superadmin);

      for (const item of result.items) {
        expect(item).not.toHaveProperty("systemQuantity");
        expect(item).not.toHaveProperty("difference");
      }
      expect(result).toMatchObject({ countedItems: 2, totalItems: 2 });
    });

    it.each([
      ["CONFIRMED", leader],
      ["NOT_CONFIRMED", superadmin],
    ] as const)(
      "reveals the differences of a %s closure to the leader and the superadmin",
      async (status, user) => {
        prisma.inventoryClosure.findUnique.mockResolvedValue(
          closureRow(status),
        );

        const result = await service.findOne(closureId, user);

        expect(result.items).toEqual([
          expect.objectContaining({
            productName: "Creatina",
            systemQuantity: 5,
            physicalQuantity: 5,
            difference: 0,
          }),
          expect.objectContaining({
            productName: "Whey",
            systemQuantity: 8,
            physicalQuantity: 7,
            difference: -1,
          }),
        ]);
        expect(result).toMatchObject({ totalDifferences: 1 });
      },
    );

    it("never reveals the differences to the assistant", async () => {
      prisma.inventoryClosure.findUnique.mockResolvedValue(
        closureRow("CONFIRMED"),
      );

      const result = await service.findOne(closureId, assistant);

      expect(result.items[0]).not.toHaveProperty("systemQuantity");
      expect(result).not.toHaveProperty("totalDifferences");
    });

    it("rejects a closure of another branch", async () => {
      prisma.inventoryClosure.findUnique.mockResolvedValue(
        closureRow("PENDING"),
      );

      await expect(service.findOne(closureId, outsider)).rejects.toMatchObject({
        response: { code: "BRANCH_SCOPE_VIOLATION" },
      });
    });

    it("answers CLOSURE_NOT_FOUND", async () => {
      prisma.inventoryClosure.findUnique.mockResolvedValue(null);

      await expect(service.findOne(closureId, leader)).rejects.toMatchObject({
        response: { code: "CLOSURE_NOT_FOUND" },
      });
    });
  });

  describe("findAll", () => {
    const summary = (status: "PENDING" | "CONFIRMED") => ({
      ...closureRow(status),
      details: [
        { physicalQuantity: 7, difference: -1 },
        { physicalQuantity: null, difference: null },
        { physicalQuantity: 4, difference: 0 },
      ],
    });

    beforeEach(() => {
      prisma.inventoryClosure.count.mockResolvedValue(2);
      prisma.inventoryClosure.findMany.mockResolvedValue([
        summary("CONFIRMED"),
        summary("PENDING"),
      ]);
    });

    it("requires the branch for the branch roles", async () => {
      await expect(
        service.findAll({ page: 1, limit: 20 }, assistant),
      ).rejects.toMatchObject({ response: { code: "BRANCH_REQUIRED" } });
    });

    it("rejects a branch outside the assignment", async () => {
      await expect(
        service.findAll(
          { page: 1, limit: 20, branchId: otherBranchId },
          leader,
        ),
      ).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_VIOLATION" } });
    });

    it("filters by branch, status and inclusive dates, newest first", async () => {
      await service.findAll(
        {
          page: 2,
          limit: 10,
          branchId,
          status: "CONFIRMED",
          from: "2026-10-01",
          to: "2026-10-26",
        },
        leader,
      );

      expect(prisma.inventoryClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            branchId,
            status: "CONFIRMED",
            closureDate: { gte: day("2026-10-01"), lte: day("2026-10-26") },
          },
          skip: 10,
          take: 10,
          orderBy: [{ closureDate: "desc" }, { createdAt: "desc" }],
        }),
      );
    });

    it("summarises the progress and, for confirmed closures, the lots with differences", async () => {
      const result = await service.findAll({ page: 1, limit: 20 }, superadmin);

      expect(result.data[0]).toEqual({
        id: closureId,
        branchId,
        branchName: "Centro",
        closureDate: "2026-10-26",
        status: "CONFIRMED",
        confirmed: true,
        locked: true,
        closedAt: new Date("2026-10-27T01:00:00Z"),
        userName: "Laura Pérez",
        countedItems: 2,
        totalItems: 3,
        totalDifferences: 1,
      });
      expect(result.data[1].totalDifferences).toBeNull();
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it("hides the differences from the assistant", async () => {
      const result = await service.findAll(
        { page: 1, limit: 20, branchId },
        assistant,
      );

      expect(result.data[0]).not.toHaveProperty("totalDifferences");
    });
  });
});
