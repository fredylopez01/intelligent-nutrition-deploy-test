import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { BranchesService } from "./branches.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const BRANCH_ID = "aaaa0000-0000-0000-0000-000000000001";
const PRODUCT_ID = "bbbb0000-0000-0000-0000-000000000002";
const CATEGORY_ID = "cccc0000-0000-0000-0000-000000000003";

const TODAY = new Date("2026-10-25T15:00:00.000Z");
const TODAY_UTC = new Date("2026-10-25T00:00:00.000Z");

const baseProduct = {
  id: PRODUCT_ID,
  name: "Whey Protein",
  referenceCode: "WP-001",
  price: { toFixed: (n: number) => "145000." + "0".repeat(n) } as unknown as { toFixed: (n: number) => string },
  unitOfMeasure: { abreviation: "kg" },
  images: [] as Array<{ url: string; isPrimary: boolean; sortOrder: number }>,
  category: { id: CATEGORY_ID, name: "Suplementos" },
};

const prisma = {
  branch: { findUnique: jest.fn<AsyncMock>() },
  branchInventory: { groupBy: jest.fn<AsyncMock>() },
  product: {
    count: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
  },
  $transaction: jest.fn<AsyncMock>(),
};

describe("BranchesService.findSellableProducts", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: TODAY });
    jest.resetAllMocks();

    prisma.branch.findUnique.mockResolvedValue({ id: BRANCH_ID });
    prisma.branchInventory.groupBy.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      (ops: unknown) => Promise.all(ops as Promise<unknown>[]),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Branch validation ───────────────────────────────────────────────────────

  it("throws BRANCH_NOT_FOUND when the branch does not exist", async () => {
    prisma.branch.findUnique.mockResolvedValue(null);
    const service = new BranchesService(prisma as never, {} as never);

    await expect(
      service.findSellableProducts(BRANCH_ID, { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ response: { code: "BRANCH_NOT_FOUND" } });
  });

  it("does not check branch scope for SUPERADMIN", async () => {
    const service = new BranchesService(prisma as never, {} as never);

    await expect(
      service.findSellableProducts(
        BRANCH_ID,
        { page: 1, limit: 20 },
        {
          id: "sa",
          active: true,
          role: { name: "SUPERADMIN" },
          branches: [],
        },
      ),
    ).resolves.toMatchObject({ data: [] });
    expect(prisma.branch.findUnique).toHaveBeenCalled();
  });

  it("does not check branch scope when no user is provided", async () => {
    const service = new BranchesService(prisma as never, {} as never);

    await expect(
      service.findSellableProducts(BRANCH_ID, { page: 1, limit: 20 }),
    ).resolves.toMatchObject({ data: [] });
    expect(prisma.branch.findUnique).toHaveBeenCalled();
  });

  // ─── Stock filters ───────────────────────────────────────────────────────────

  it("passes startOfTodayUtc as lower bound for expirationDate in groupBy", async () => {
    const service = new BranchesService(prisma as never, {} as never);

    await service.findSellableProducts(BRANCH_ID, { page: 1, limit: 20 });

    expect(prisma.branchInventory.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId: BRANCH_ID, expirationDate: { gte: TODAY_UTC } },
      }),
    );
  });

  it("returns an empty page when no non-expired lots exist", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns an empty page when all non-expired lots have zero quantity", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 0 } },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("excludes lots with null quantity sum from the product query", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: null } },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ─── Product query filters ───────────────────────────────────────────────────

  it("includes categoryId in the product query when provided", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 3 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      { ...baseProduct, price: { toFixed: () => "145000.00" } },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
      categoryId: CATEGORY_ID,
    });

    expect(prisma.product.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: CATEGORY_ID }),
      }),
    );
  });

  it("does not include categoryId in the product query when not provided", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 3 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      { ...baseProduct, price: { toFixed: () => "145000.00" } },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    await service.findSellableProducts(BRANCH_ID, { page: 1, limit: 20 });

    const callArg = (prisma.product.count.mock.calls[0] as [{ where: Record<string, unknown> }])[0];
    expect(callArg.where).not.toHaveProperty("categoryId");
  });

  it("adds a search OR clause for name and referenceCode when search is provided", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 3 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      { ...baseProduct, price: { toFixed: () => "145000.00" } },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
      search: "whey",
    });

    const callArg = (prisma.product.count.mock.calls[0] as [{ where: Record<string, unknown> }])[0];
    expect(callArg.where).toMatchObject({
      OR: [
        { name: { contains: "whey", mode: "insensitive" } },
        { referenceCode: { contains: "whey", mode: "insensitive" } },
      ],
    });
  });

  it("only queries active products", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 3 } },
    ]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);
    const service = new BranchesService(prisma as never, {} as never);

    await service.findSellableProducts(BRANCH_ID, { page: 1, limit: 20 });

    const callArg = (prisma.product.count.mock.calls[0] as [{ where: Record<string, unknown> }])[0];
    expect(callArg.where).toMatchObject({ active: true });
  });

  // ─── Response shape ──────────────────────────────────────────────────────────

  it("returns the correct product shape with availableQuantity and price string", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 7 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_ID,
        name: "Whey Protein",
        referenceCode: "WP-001",
        price: { toFixed: (n: number) => `145000.${"0".repeat(n as number)}` },
        unitOfMeasure: { abreviation: "kg" },
        images: [],
        category: { id: CATEGORY_ID, name: "Suplementos" },
      },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      productId: PRODUCT_ID,
      name: "Whey Protein",
      referenceCode: "WP-001",
      price: "145000.00",
      availableQuantity: 7,
      unit: "kg",
      category: { id: CATEGORY_ID, name: "Suplementos" },
      primaryImageUrl: null,
    });
  });

  it("assigns availableQuantity from the grouped sum even when products are reordered", async () => {
    const PRODUCT_B = "eeee0000-0000-0000-0000-000000000005";
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 3 } },
      { productId: PRODUCT_B, _sum: { quantity: 12 } },
    ]);
    prisma.product.count.mockResolvedValue(2);
    prisma.product.findMany.mockResolvedValue([
      {
        id: PRODUCT_B,
        name: "Creatina",
        referenceCode: "CR-002",
        price: { toFixed: () => "50000.00" },
        unitOfMeasure: { abreviation: "g" },
        images: [],
        category: { id: CATEGORY_ID, name: "Suplementos" },
      },
      {
        id: PRODUCT_ID,
        name: "Whey Protein",
        referenceCode: "WP-001",
        price: { toFixed: () => "145000.00" },
        unitOfMeasure: { abreviation: "kg" },
        images: [],
        category: { id: CATEGORY_ID, name: "Suplementos" },
      },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    const whey = result.data.find((p) => p.productId === PRODUCT_ID);
    const creatine = result.data.find((p) => p.productId === PRODUCT_B);
    expect(whey?.availableQuantity).toBe(3);
    expect(creatine?.availableQuantity).toBe(12);
  });

  // ─── primaryImageUrl ──────────────────────────────────────────────────────────

  it("returns null primaryImageUrl when the product has no images", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 2 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      {
        ...baseProduct,
        images: [],
        price: { toFixed: () => "145000.00" },
      },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data[0].primaryImageUrl).toBeNull();
  });

  it("returns the isPrimary image URL when one is marked as primary", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 2 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      {
        ...baseProduct,
        images: [
          { url: "https://cdn.example.com/secondary.jpg", isPrimary: false, sortOrder: 1 },
          { url: "https://cdn.example.com/primary.jpg", isPrimary: true, sortOrder: 2 },
        ],
        price: { toFixed: () => "145000.00" },
      },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data[0].primaryImageUrl).toBe(
      "https://cdn.example.com/primary.jpg",
    );
  });

  it("falls back to the image with the lowest sortOrder when none is primary", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 2 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      {
        ...baseProduct,
        images: [
          { url: "https://cdn.example.com/third.jpg", isPrimary: false, sortOrder: 3 },
          { url: "https://cdn.example.com/first.jpg", isPrimary: false, sortOrder: 1 },
          { url: "https://cdn.example.com/second.jpg", isPrimary: false, sortOrder: 2 },
        ],
        price: { toFixed: () => "145000.00" },
      },
    ]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data[0].primaryImageUrl).toBe(
      "https://cdn.example.com/first.jpg",
    );
  });

  // ─── Pagination ───────────────────────────────────────────────────────────────

  it("returns correct pagination meta when products exist", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 5 } },
    ]);
    prisma.product.count.mockResolvedValue(45);
    prisma.product.findMany.mockResolvedValue([]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 3,
      limit: 10,
    });

    expect(result.meta).toEqual({
      page: 3,
      limit: 10,
      total: 45,
      totalPages: 5,
    });
  });

  it("passes correct skip to findMany based on page and limit", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 5 } },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([]);
    const service = new BranchesService(prisma as never, {} as never);

    await service.findSellableProducts(BRANCH_ID, { page: 3, limit: 10 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("returns totalPages = 0 when total is 0", async () => {
    prisma.branchInventory.groupBy.mockResolvedValue([
      { productId: PRODUCT_ID, _sum: { quantity: 5 } },
    ]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);
    const service = new BranchesService(prisma as never, {} as never);

    const result = await service.findSellableProducts(BRANCH_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.meta.totalPages).toBe(0);
  });
});
