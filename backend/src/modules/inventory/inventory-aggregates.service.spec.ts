import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { ListConsolidatedQueryDto } from "./dto/list-consolidated-query.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const productId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const categoryId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const prismaMock = {
  product: {
    findUnique: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    count: jest.fn<AsyncMock>(),
  },
  branch: {
    findMany: jest.fn<AsyncMock>(),
  },
  branchInventory: {
    findMany: jest.fn<AsyncMock>(),
  },
  $transaction: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { InventoryService } = await import("./inventory.service.js");

const query = (
  overrides: Partial<ListConsolidatedQueryDto> = {},
): ListConsolidatedQueryDto => ({ page: 1, limit: 20, ...overrides });

const branch = (id: string, name: string, active = true) => ({
  id,
  name,
  active,
});

describe("InventoryService aggregated queries", () => {
  let service: InstanceType<typeof InventoryService>;
  let testingModule: Awaited<ReturnType<typeof Test.createTestingModule>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    testingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: {} },
      ],
    }).compile();
    service = testingModule.get(InventoryService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  describe("getAvailability", () => {
    const product = {
      id: productId,
      name: "Whey Protein 2 lb",
      referenceCode: "WHEY-2LB-001",
    };

    it("requests only active branches ordered by name, filtered by product", async () => {
      prismaMock.product.findUnique.mockResolvedValue(product);
      prismaMock.branch.findMany.mockResolvedValue([]);

      await service.getAvailability(productId);

      expect(prismaMock.product.findUnique).toHaveBeenCalledWith({
        where: { id: productId },
        select: { id: true, name: true, referenceCode: true },
      });
      expect(prismaMock.branch.findMany).toHaveBeenCalledWith({
        where: { active: true },
        select: {
          id: true,
          name: true,
          branchInventories: {
            where: { productId },
            select: { quantity: true },
          },
        },
        orderBy: { name: "asc" },
      });
    });

    it("sums the quantity of every lot per branch", async () => {
      prismaMock.product.findUnique.mockResolvedValue(product);
      prismaMock.branch.findMany.mockResolvedValue([
        {
          id: "branch-centro",
          name: "Centro",
          branchInventories: [{ quantity: 5 }, { quantity: 7 }],
        },
        {
          id: "branch-norte",
          name: "Norte",
          branchInventories: [{ quantity: 20 }],
        },
      ]);

      const result = await service.getAvailability(productId);

      expect(result).toEqual({
        data: {
          product,
          branches: [
            { branchId: "branch-centro", branchName: "Centro", quantity: 12 },
            { branchId: "branch-norte", branchName: "Norte", quantity: 20 },
          ],
        },
      });
    });

    it("reports quantity 0 for an active branch without lots of the product", async () => {
      prismaMock.product.findUnique.mockResolvedValue(product);
      prismaMock.branch.findMany.mockResolvedValue([
        { id: "branch-sur", name: "Sur", branchInventories: [] },
      ]);

      const result = await service.getAvailability(productId);

      expect(result.data.branches).toEqual([
        { branchId: "branch-sur", branchName: "Sur", quantity: 0 },
      ]);
    });

    it("returns an empty branch list when there are no active branches", async () => {
      prismaMock.product.findUnique.mockResolvedValue(product);
      prismaMock.branch.findMany.mockResolvedValue([]);

      const result = await service.getAvailability(productId);

      expect(result).toEqual({ data: { product, branches: [] } });
    });

    it("does not expose minimum stock, prices or any other branch data", async () => {
      prismaMock.product.findUnique.mockResolvedValue(product);
      prismaMock.branch.findMany.mockResolvedValue([
        {
          id: "branch-centro",
          name: "Centro",
          branchInventories: [{ quantity: 4 }],
        },
      ]);

      const result = await service.getAvailability(productId);

      expect(Object.keys(result.data.product).sort()).toEqual([
        "id",
        "name",
        "referenceCode",
      ]);
      expect(Object.keys(result.data.branches[0]).sort()).toEqual([
        "branchId",
        "branchName",
        "quantity",
      ]);
    });

    it("rejects an unknown product without querying branches", async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(service.getAvailability(productId)).rejects.toMatchObject({
        response: { code: "PRODUCT_NOT_FOUND" },
      });

      expect(prismaMock.branch.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getConsolidated", () => {
    it("returns an empty page without further queries when no branch has stock", async () => {
      prismaMock.branchInventory.findMany.mockResolvedValue([]);

      const result = await service.getConsolidated(query({ page: 2, limit: 10 }));

      expect(prismaMock.branchInventory.findMany).toHaveBeenCalledWith({
        distinct: ["productId"],
        select: { productId: true },
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: [],
        meta: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it("adds up lots of the same branch and totals across branches", async () => {
      prismaMock.branchInventory.findMany.mockResolvedValue([{ productId }]);
      prismaMock.$transaction.mockResolvedValue([
        1,
        [
          {
            id: productId,
            name: "Whey Protein 2 lb",
            referenceCode: "WHEY-2LB-001",
            inventories: [
              { quantity: 5, minimumStock: 2, branch: branch("b-centro", "Centro") },
              { quantity: 7, minimumStock: 2, branch: branch("b-centro", "Centro") },
              { quantity: 10, minimumStock: 4, branch: branch("b-norte", "Norte") },
            ],
          },
        ],
      ]);

      const result = await service.getConsolidated(query());

      expect(result.data).toEqual([
        {
          product: {
            id: productId,
            name: "Whey Protein 2 lb",
            referenceCode: "WHEY-2LB-001",
          },
          branchesTotal: 22,
          total: 22,
          branches: [
            { branchId: "b-centro", branchName: "Centro", quantity: 12, minimumStock: 2 },
            { branchId: "b-norte", branchName: "Norte", quantity: 10, minimumStock: 4 },
          ],
        },
      ]);
    });

    it("calculates the totals of each product independently", async () => {
      const otherProductId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      prismaMock.branchInventory.findMany.mockResolvedValue([
        { productId },
        { productId: otherProductId },
      ]);
      prismaMock.$transaction.mockResolvedValue([
        2,
        [
          {
            id: productId,
            name: "Producto A",
            referenceCode: "A-001",
            inventories: [
              { quantity: 3, minimumStock: 1, branch: branch("b-centro", "Centro") },
            ],
          },
          {
            id: otherProductId,
            name: "Producto B",
            referenceCode: "B-001",
            inventories: [
              { quantity: 8, minimumStock: 5, branch: branch("b-centro", "Centro") },
              { quantity: 2, minimumStock: 5, branch: branch("b-norte", "Norte") },
            ],
          },
        ],
      ]);

      const result = await service.getConsolidated(query());

      expect(result.data.map((row) => row.total)).toEqual([3, 10]);
      expect(result.data.map((row) => row.branchesTotal)).toEqual([3, 10]);
      expect(result.data.map((row) => row.branches.length)).toEqual([1, 2]);
    });

    it("returns zero totals and no branches for a product without inventories", async () => {
      prismaMock.branchInventory.findMany.mockResolvedValue([{ productId }]);
      prismaMock.$transaction.mockResolvedValue([
        1,
        [
          {
            id: productId,
            name: "Producto A",
            referenceCode: "A-001",
            inventories: [],
          },
        ],
      ]);

      const result = await service.getConsolidated(query());

      expect(result.data[0]).toMatchObject({
        branchesTotal: 0,
        total: 0,
        branches: [],
      });
    });

    it("queries only products that have stock, paginated and ordered by name", async () => {
      prismaMock.branchInventory.findMany.mockResolvedValue([{ productId }]);
      prismaMock.$transaction.mockResolvedValue([1, []]);

      await service.getConsolidated(query({ page: 3, limit: 10 }));

      const expectedWhere = { id: { in: [productId] } };
      expect(prismaMock.product.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          skip: 20,
          take: 10,
          orderBy: { name: "asc" },
        }),
      );
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("applies the category and search filters", async () => {
      prismaMock.branchInventory.findMany.mockResolvedValue([{ productId }]);
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await service.getConsolidated(query({ categoryId, search: "whey" }));

      const expectedWhere = {
        id: { in: [productId] },
        categoryId,
        OR: [
          { name: { contains: "whey", mode: "insensitive" } },
          { referenceCode: { contains: "whey", mode: "insensitive" } },
        ],
      };
      expect(prismaMock.product.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
    });

    it.each([
      [45, 20, 3],
      [40, 20, 2],
      [1, 20, 1],
      [21, 20, 2],
    ])(
      "calculates totalPages for %s rows with limit %s",
      async (total, limit, totalPages) => {
        prismaMock.branchInventory.findMany.mockResolvedValue([{ productId }]);
        prismaMock.$transaction.mockResolvedValue([total, []]);

        const result = await service.getConsolidated(query({ limit }));

        expect(result.meta).toEqual({ page: 1, limit, total, totalPages });
      },
    );

    it("returns totalPages 0 when the filters match no products", async () => {
      prismaMock.branchInventory.findMany.mockResolvedValue([{ productId }]);
      prismaMock.$transaction.mockResolvedValue([0, []]);

      const result = await service.getConsolidated(query({ search: "zzzz" }));

      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it("rejects a search shorter than two characters before querying", async () => {
      await expect(
        service.getConsolidated(query({ search: "a" })),
      ).rejects.toMatchObject({
        response: { code: "SEARCH_TOO_SHORT", details: { minLength: 2 } },
      });

      expect(prismaMock.branchInventory.findMany).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
