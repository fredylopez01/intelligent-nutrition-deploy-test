import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { LowStockService } from "../notifications/low-stock.service.js";
import { GeneralStockService } from "../general-stock/general-stock.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_CENTRO = "bbbb0000-0000-4000-8000-000000000001";
const BRANCH_NORTE  = "cccc0000-0000-4000-8000-000000000002";
const BRANCH_SUR    = "dddd0000-0000-4000-8000-000000000003";

const TODAY = new Date("2026-10-28T14:00:00.000Z");
const TODAY_UTC = new Date("2026-10-28T00:00:00.000Z");

const product = {
  id: PRODUCT_ID,
  name: "Whey Protein 2 lb",
  referenceCode: "WHEY-2LB-001",
};

const prismaMock = {
  product: { findUnique: jest.fn<AsyncMock>() },
  branch: { findMany: jest.fn<AsyncMock>() },
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { PrismaService } = await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { InventoryService } = await import("./inventory.service.js");

describe("InventoryService.getAvailability", () => {
  let service: InstanceType<typeof InventoryService>;
  let testingModule: Awaited<ReturnType<typeof Test.createTestingModule>>;

  beforeEach(async () => {
    jest.useFakeTimers({ now: TODAY });
    jest.clearAllMocks();

    prismaMock.product.findUnique.mockResolvedValue(product);
    prismaMock.branch.findMany.mockResolvedValue([]);

    testingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: {} },
        {
          provide: LowStockService,
          useValue: { levels: async () => new Map(), notifyCrossings: async () => 0 },
        },
        {
          provide: GeneralStockService,
          useValue: { consume: async () => undefined, increase: async () => undefined },
        },
      ],
    }).compile();

    service = testingModule.get(InventoryService);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await testingModule.close();
  });

  // ─── Product validation ────────────────────────────────────────────────────

  it("throws PRODUCT_NOT_FOUND when the product does not exist", async () => {
    prismaMock.product.findUnique.mockResolvedValue(null);

    await expect(service.getAvailability(PRODUCT_ID)).rejects.toMatchObject({
      response: { code: "PRODUCT_NOT_FOUND" },
    });

    expect(prismaMock.branch.findMany).not.toHaveBeenCalled();
  });

  it("queries the product by id selecting only id, name and referenceCode", async () => {
    await service.getAvailability(PRODUCT_ID);

    expect(prismaMock.product.findUnique).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      select: { id: true, name: true, referenceCode: true },
    });
  });

  // ─── Branch query ──────────────────────────────────────────────────────────

  it("queries only active branches, ordered by name", async () => {
    await service.getAvailability(PRODUCT_ID);

    const [args] = prismaMock.branch.findMany.mock.calls[0] as [
      { where: unknown; orderBy: unknown },
    ];
    expect(args.where).toEqual({ active: true });
    expect(args.orderBy).toEqual({ name: "asc" });
  });

  it("filters lots by productId and expiration date ≥ startOfTodayUtc", async () => {
    await service.getAvailability(PRODUCT_ID);

    const [args] = prismaMock.branch.findMany.mock.calls[0] as [
      {
        select: {
          branchInventories: { where: { productId: string; expirationDate: { gte: Date } } };
        };
      },
    ];
    expect(args.select.branchInventories.where).toEqual({
      productId: PRODUCT_ID,
      expirationDate: { gte: TODAY_UTC },
    });
  });

  it("excludes a specific branch when excludeBranchId is provided", async () => {
    await service.getAvailability(PRODUCT_ID, BRANCH_CENTRO);

    const [args] = prismaMock.branch.findMany.mock.calls[0] as [
      { where: { active: boolean; id?: { not: string } } },
    ];
    expect(args.where).toEqual({ active: true, id: { not: BRANCH_CENTRO } });
  });

  it("does not add an id filter when excludeBranchId is omitted", async () => {
    await service.getAvailability(PRODUCT_ID);

    const [args] = prismaMock.branch.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where).not.toHaveProperty("id");
  });

  // ─── Response shape and quantity aggregation ───────────────────────────────

  it("returns the product data and an empty branch list when no active branches exist", async () => {
    const result = await service.getAvailability(PRODUCT_ID);

    expect(result).toEqual({ data: { product, branches: [] } });
  });

  it("sums the quantities of all non-expired lots for each branch", async () => {
    prismaMock.branch.findMany.mockResolvedValue([
      {
        id: BRANCH_CENTRO,
        name: "Centro",
        branchInventories: [{ quantity: 5 }, { quantity: 7 }],
      },
      {
        id: BRANCH_NORTE,
        name: "Norte",
        branchInventories: [{ quantity: 20 }],
      },
    ]);

    const result = await service.getAvailability(PRODUCT_ID);

    expect(result.data.branches).toEqual([
      { branchId: BRANCH_CENTRO, branchName: "Centro", quantity: 12 },
      { branchId: BRANCH_NORTE,  branchName: "Norte",  quantity: 20 },
    ]);
  });

  it("reports quantity 0 for an active branch that has no non-expired lots", async () => {
    prismaMock.branch.findMany.mockResolvedValue([
      { id: BRANCH_SUR, name: "Sur", branchInventories: [] },
    ]);

    const result = await service.getAvailability(PRODUCT_ID);

    expect(result.data.branches).toEqual([
      { branchId: BRANCH_SUR, branchName: "Sur", quantity: 0 },
    ]);
  });

  it("exposes only branchId, branchName and quantity per branch — no minimumStock or price", async () => {
    prismaMock.branch.findMany.mockResolvedValue([
      {
        id: BRANCH_CENTRO,
        name: "Centro",
        branchInventories: [{ quantity: 4 }],
      },
    ]);

    const result = await service.getAvailability(PRODUCT_ID);

    expect(Object.keys(result.data.branches[0]).sort()).toEqual([
      "branchId",
      "branchName",
      "quantity",
    ]);
  });

  it("exposes only id, name and referenceCode for the product", async () => {
    const result = await service.getAvailability(PRODUCT_ID);

    expect(Object.keys(result.data.product).sort()).toEqual([
      "id",
      "name",
      "referenceCode",
    ]);
  });

  it("excludes inactive branches from the result", async () => {
    prismaMock.branch.findMany.mockResolvedValue([
      {
        id: BRANCH_CENTRO,
        name: "Centro",
        branchInventories: [{ quantity: 8 }],
      },
    ]);

    const result = await service.getAvailability(PRODUCT_ID);

    expect(result.data.branches).toHaveLength(1);
    expect(prismaMock.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: true }) }),
    );
  });
});
