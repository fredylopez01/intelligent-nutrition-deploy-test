import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

interface InventoryRow {
  product: {
    id: string;
    name: string;
    referenceCode: string;
    category: { id: string; name: string };
    unitOfMeasure: { abbreviation: string };
    price: string;
    active: boolean;
  };
  totalQuantity: number;
  minimumStock?: number;
  lowStock?: boolean;
}

interface ListBody {
  data: InventoryRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface DetailBody {
  branchId: string;
  product: InventoryRow["product"];
  totalQuantity: number;
  minimumStock?: number;
  lowStock?: boolean;
  lots: {
    id: string;
    quantity: number;
    expirationDate: string;
    updatedAt: string;
  }[];
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-IL-${runId}`;
const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const names = {
  alpha: `${runId} Alpha`,
  bravo: `${runId} Bravo`,
  charlie: `${runId} Charlie`,
  delta: `${runId} Delta`,
};

const errorOf = (body: unknown) => (body as ApiError).error;

// The service returns `{ data, meta }` and the API may wrap it again, so these
// helpers accept both the wrapped and the unwrapped shapes.
const listOf = (body: unknown): ListBody => {
  const root = body as { data: unknown };
  return (Array.isArray(root.data) ? root : root.data) as ListBody;
};

const detailOf = (body: unknown): DetailBody => {
  const outer = (body as { data: Record<string, unknown> }).data;
  return ("data" in outer ? outer.data : outer) as DetailBody;
};

const productNames = (body: unknown) =>
  listOf(body).data.map((row) => row.product.name);

describe("GET /api/v1/branches/:branchId/inventory (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let documentTypeId = "";
  let categoryId = "";
  let otherCategoryId = "";
  let unitOfMeasureId = "";
  let branchId = "";
  let otherBranchId = "";
  let emptyBranchId = "";
  const products = {} as Record<keyof typeof names, string>;
  const alphaLotIds: string[] = [];
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const authorize = <T extends request.Test>(pending: T, token?: string) => {
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const getList = (
    targetBranchId: string,
    token?: string,
    query: Record<string, string | number> = {},
  ) =>
    authorize(
      request(app!.getHttpServer())
        .get(`/api/v1/branches/${targetBranchId}/inventory`)
        .query(query),
      token,
    );

  const getDetail = (
    targetBranchId: string,
    targetProductId: string,
    token?: string,
  ) =>
    authorize(
      request(app!.getHttpServer()).get(
        `/api/v1/branches/${targetBranchId}/inventory/${targetProductId}`,
      ),
      token,
    );

  const createProduct = (
    key: keyof typeof names,
    code: string,
    productCategoryId: string,
    active = true,
  ) =>
    prisma!.product.create({
      data: {
        name: names[key],
        referenceCode: `LS-${runId}-${code}`,
        categoryId: productCategoryId,
        unitOfMeasureId,
        price: "1000.00",
        active,
      },
    });

  const createLot = (
    targetBranchId: string,
    productId: string,
    quantity: number,
    minimumStock: number,
    expirationDate: string,
  ) =>
    prisma!.branchInventory.create({
      data: {
        branchId: targetBranchId,
        productId,
        quantity,
        minimumStock,
        expirationDate: new Date(expirationDate),
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const database = app.get(PrismaService);
    prisma = database;
    const jwtService = app.get(JwtService);

    documentTypeId = (
      await database.documentType.create({
        data: { code: DOCUMENT_CODE, name: "Document (e2e inventory list)" },
      })
    ).id;

    const actorIds = {} as Record<RoleName, string>;
    for (const [index, roleName] of roleNames.entries()) {
      const role = await database.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await database.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}${index}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.inventory-list.${runId}@e2e.test`,
          phone: "3009998877",
          address: "Carrera 9 # 8-7",
          userAccount: {
            create: {
              roleId: role.id,
              active: true,
              mustChangePassword: false,
            },
          },
        },
      });
      personIds.push(person.id);
      actorIds[roleName] = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const createBranch = async (label: string) =>
      (
        await database.branch.create({
          data: {
            name: `${runId} ${label}`,
            address: "Calle 1 # 2-3",
            phone: "3001112233",
            active: true,
          },
        })
      ).id;
    branchId = await createBranch("Branch List");
    otherBranchId = await createBranch("Other Branch List");
    emptyBranchId = await createBranch("Empty Branch List");

    // Leader and assistant are only assigned to `branchId`.
    for (const roleName of ["BRANCH_LEADER", "BRANCH_ASSISTANT"] as const) {
      await database.userBranch.create({
        data: {
          userId: actorIds[roleName],
          branchId,
          assignmentDate: new Date(),
          active: true,
        },
      });
    }

    categoryId = (
      await database.category.create({
        data: { name: `${runId} List Category`, active: true },
      })
    ).id;
    otherCategoryId = (
      await database.category.create({
        data: { name: `${runId} Other List Category`, active: true },
      })
    ).id;
    unitOfMeasureId = (
      await database.unitMeasure.create({
        data: {
          name: `${runId} List Unit`,
          abreviation: `LU${runId.slice(-7)}`,
          active: true,
        },
      })
    ).id;

    products.alpha = (await createProduct("alpha", "A", categoryId)).id;
    products.bravo = (await createProduct("bravo", "B", categoryId)).id;
    products.charlie = (
      await createProduct("charlie", "C", otherCategoryId)
    ).id;
    products.delta = (await createProduct("delta", "D", categoryId, false)).id;

    // Alpha: two lots, total 7 < minimum 10 (low stock).
    alphaLotIds.push(
      (await createLot(branchId, products.alpha, 3, 10, "2027-01-01T00:00:00.000Z")).id,
      (await createLot(branchId, products.alpha, 4, 10, "2027-02-01T00:00:00.000Z")).id,
    );
    // Bravo: total 20, minimum 5 (not low).
    await createLot(branchId, products.bravo, 20, 5, "2027-03-01T00:00:00.000Z");
    // Charlie: total 2, minimum 2 (not low, the check is strictly lower).
    await createLot(branchId, products.charlie, 2, 2, "2027-03-01T00:00:00.000Z");
    // Delta: inactive product that still has stock.
    await createLot(branchId, products.delta, 9, 1, "2027-03-01T00:00:00.000Z");
    // Same product in another branch must never show up in `branchId`.
    await createLot(otherBranchId, products.alpha, 100, 1, "2027-03-01T00:00:00.000Z");
  }, 30000);

  afterAll(async () => {
    try {
      if (prisma) {
        const productIds = Object.values(products).filter(Boolean);
        const branchIds = [branchId, otherBranchId, emptyBranchId].filter(
          Boolean,
        );
        await prisma.branchInventory.deleteMany({
          where: { productId: { in: productIds } },
        });
        await prisma.userBranch.deleteMany({
          where: { userId: { in: personIds } },
        });
        await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
        await prisma.product.deleteMany({ where: { id: { in: productIds } } });
        await prisma.category.deleteMany({
          where: { id: { in: [categoryId, otherCategoryId].filter(Boolean) } },
        });
        await prisma.unitMeasure.deleteMany({
          where: { id: { in: [unitOfMeasureId].filter(Boolean) } },
        });
        await prisma.userAccount.deleteMany({
          where: { personId: { in: personIds } },
        });
        await prisma.person.deleteMany({ where: { id: { in: personIds } } });
        await prisma.documentType.deleteMany({
          where: { id: documentTypeId },
        });
      }
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("listing", () => {
    it("returns one row per product, ordered by name, without inactive products or other branches", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN).expect(200);
      const body = listOf(response.body);

      expect(productNames(response.body)).toEqual([
        names.alpha,
        names.bravo,
        names.charlie,
      ]);
      expect(body.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
      expect(body.data[0]).toMatchObject({
        product: {
          id: products.alpha,
          name: names.alpha,
          referenceCode: `LS-${runId}-A`,
          category: { id: categoryId, name: `${runId} List Category` },
          unitOfMeasure: { abbreviation: `LU${runId.slice(-7)}` },
          price: "1000.00",
          active: true,
        },
        totalQuantity: 7,
        minimumStock: 10,
        lowStock: true,
      });
      expect(body.data.map((row) => row.totalQuantity)).toEqual([7, 20, 2]);
    });

    it("returns an empty page for a branch without inventory", async () => {
      const response = await getList(emptyBranchId, tokens.SUPERADMIN).expect(
        200,
      );

      expect(listOf(response.body)).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it("paginates the results", async () => {
      const first = await getList(branchId, tokens.SUPERADMIN, {
        page: 1,
        limit: 2,
      }).expect(200);
      const second = await getList(branchId, tokens.SUPERADMIN, {
        page: 2,
        limit: 2,
      }).expect(200);

      expect(productNames(first.body)).toEqual([names.alpha, names.bravo]);
      expect(listOf(first.body).meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(productNames(second.body)).toEqual([names.charlie]);
      expect(listOf(second.body).meta.page).toBe(2);
    });

    it.each([
      ["name desc", { sortBy: "name", sortOrder: "desc" }, ["charlie", "bravo", "alpha"]],
      ["quantity desc", { sortBy: "quantity", sortOrder: "desc" }, ["bravo", "alpha", "charlie"]],
      ["quantity asc", { sortBy: "quantity", sortOrder: "asc" }, ["charlie", "alpha", "bravo"]],
      ["referenceCode desc", { sortBy: "referenceCode", sortOrder: "desc" }, ["charlie", "bravo", "alpha"]],
    ] as const)("sorts by %s", async (_label, query, expected) => {
      const response = await getList(branchId, tokens.SUPERADMIN, query).expect(
        200,
      );

      expect(productNames(response.body)).toEqual(
        expected.map((key) => names[key]),
      );
    });
  });

  describe("filters", () => {
    it("searches by product name ignoring case", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        search: "BRAVO",
      }).expect(200);

      expect(productNames(response.body)).toEqual([names.bravo]);
      expect(listOf(response.body).meta.total).toBe(1);
    });

    it("searches by reference code", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        search: `ls-${runId}-c`,
      }).expect(200);

      expect(productNames(response.body)).toEqual([names.charlie]);
    });

    it("returns an empty page when the search has no matches", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        search: "zzzz-no-match",
      }).expect(200);

      expect(listOf(response.body)).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it("rejects a search shorter than two characters", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        search: "a",
      }).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        code: "SEARCH_TOO_SHORT",
        details: { minLength: 2 },
      });
    });

    it("filters by category", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        categoryId: otherCategoryId,
      }).expect(200);

      expect(productNames(response.body)).toEqual([names.charlie]);
    });

    it("filters by lowStock=true using the total of all lots", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        lowStock: "true",
      }).expect(200);
      const body = listOf(response.body);

      expect(productNames(response.body)).toEqual([names.alpha]);
      expect(body.data[0]).toMatchObject({
        totalQuantity: 7,
        minimumStock: 10,
        lowStock: true,
      });
      expect(body.meta.total).toBe(1);
    });

    it("filters by lowStock=false", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        lowStock: "false",
      }).expect(200);

      expect(productNames(response.body)).toEqual([names.bravo, names.charlie]);
    });

    it("lists inactive products with productActive=false", async () => {
      const response = await getList(branchId, tokens.SUPERADMIN, {
        productActive: "false",
      }).expect(200);

      expect(productNames(response.body)).toEqual([names.delta]);
    });

    it.each([
      ["page below 1", { page: 0 }],
      ["limit above 100", { limit: 101 }],
      ["malformed categoryId", { categoryId: "not-a-uuid" }],
      ["invalid sortBy", { sortBy: "price" }],
      ["invalid sortOrder", { sortOrder: "up" }],
      ["unknown query parameter", { foo: "bar" }],
    ])("rejects %s", async (_label, query) => {
      const response = await getList(branchId, tokens.SUPERADMIN, query).expect(
        400,
      );

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });
  });

  describe("detail", () => {
    it("returns the product with its lots ordered by expiration date", async () => {
      const response = await getDetail(
        branchId,
        products.alpha,
        tokens.SUPERADMIN,
      ).expect(200);
      const detail = detailOf(response.body);

      expect(detail).toMatchObject({
        branchId,
        product: {
          id: products.alpha,
          name: names.alpha,
          referenceCode: `LS-${runId}-A`,
          category: { id: categoryId, name: `${runId} List Category` },
          unitOfMeasure: { abbreviation: `LU${runId.slice(-7)}` },
          price: "1000.00",
          active: true,
        },
        totalQuantity: 7,
        minimumStock: 10,
        lowStock: true,
      });
      expect(detail.lots).toHaveLength(2);
      expect(detail.lots.map((lot) => lot.id)).toEqual(alphaLotIds);
      expect(detail.lots.map((lot) => lot.quantity)).toEqual([3, 4]);
      expect(detail.lots.map((lot) => lot.expirationDate)).toEqual([
        "2027-01-01T00:00:00.000Z",
        "2027-02-01T00:00:00.000Z",
      ]);
      expect(detail.lots[0].updatedAt).toEqual(expect.any(String));
    });

    it("reports lowStock false when the total reaches the minimum", async () => {
      const response = await getDetail(
        branchId,
        products.charlie,
        tokens.SUPERADMIN,
      ).expect(200);

      expect(detailOf(response.body)).toMatchObject({
        totalQuantity: 2,
        minimumStock: 2,
        lowStock: false,
      });
    });

    it("does not mix lots from another branch", async () => {
      const response = await getDetail(
        otherBranchId,
        products.alpha,
        tokens.SUPERADMIN,
      ).expect(200);
      const detail = detailOf(response.body);

      expect(detail.branchId).toBe(otherBranchId);
      expect(detail.totalQuantity).toBe(100);
      expect(detail.lots).toHaveLength(1);
    });

    it("returns 404 when the product is not assigned to the branch", async () => {
      const response = await getDetail(
        emptyBranchId,
        products.alpha,
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_ASSIGNED");
    });

    it("returns 404 when the product does not exist", async () => {
      const response = await getDetail(
        branchId,
        randomUUID(),
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_ASSIGNED");
    });

    it("rejects malformed ids", async () => {
      await getDetail("not-a-uuid", products.alpha, tokens.SUPERADMIN).expect(
        400,
      );
      await getDetail(branchId, "not-a-uuid", tokens.SUPERADMIN).expect(400);
    });
  });

  describe("scope, roles and authentication", () => {
    it("returns 404 for a branch that does not exist", async () => {
      const response = await getList(randomUUID(), tokens.SUPERADMIN).expect(
        404,
      );

      expect(errorOf(response.body).code).toBe("BRANCH_NOT_FOUND");
    });

    it("rejects a malformed branch id in the listing", async () => {
      await getList("not-a-uuid", tokens.SUPERADMIN).expect(400);
    });

    it("allows a BRANCH_LEADER to read a branch assigned to them", async () => {
      const list = await getList(branchId, tokens.BRANCH_LEADER).expect(200);
      const detail = await getDetail(
        branchId,
        products.alpha,
        tokens.BRANCH_LEADER,
      ).expect(200);

      expect(productNames(list.body)).toEqual([
        names.alpha,
        names.bravo,
        names.charlie,
      ]);
      expect(listOf(list.body).data[0]).toMatchObject({
        minimumStock: 10,
        lowStock: true,
      });
      expect(detailOf(detail.body)).toMatchObject({
        minimumStock: 10,
        lowStock: true,
      });
    });

    it("denies a BRANCH_LEADER access to a branch outside their scope", async () => {
      const list = await getList(otherBranchId, tokens.BRANCH_LEADER).expect(
        403,
      );
      const detail = await getDetail(
        otherBranchId,
        products.alpha,
        tokens.BRANCH_LEADER,
      ).expect(403);

      expect(errorOf(list.body).code).toBe("BRANCH_OUT_OF_SCOPE");
      expect(errorOf(detail.body).code).toBe("BRANCH_OUT_OF_SCOPE");
    });

    it("lets a BRANCH_ASSISTANT list their branch without thresholds", async () => {
      const response = await getList(branchId, tokens.BRANCH_ASSISTANT).expect(
        200,
      );
      const rows = listOf(response.body).data;

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row).not.toHaveProperty("minimumStock");
        expect(row).not.toHaveProperty("lowStock");
        expect(row.totalQuantity).toEqual(expect.any(Number));
      }
    });

    it("lets a BRANCH_ASSISTANT read a product detail without thresholds", async () => {
      const response = await getDetail(
        branchId,
        products.alpha,
        tokens.BRANCH_ASSISTANT,
      ).expect(200);
      const detail = detailOf(response.body);

      expect(detail).not.toHaveProperty("minimumStock");
      expect(detail).not.toHaveProperty("lowStock");
      expect(detail.totalQuantity).toBe(7);
    });

    it("denies DEV access to both endpoints", async () => {
      const list = await getList(branchId, tokens.DEV).expect(403);
      const detail = await getDetail(
        branchId,
        products.alpha,
        tokens.DEV,
      ).expect(403);

      expect(errorOf(list.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(errorOf(detail.body).code).toBe("INSUFFICIENT_PERMISSIONS");
    });

    it("requires authentication", async () => {
      await getList(branchId).expect(401);
      await getDetail(branchId, products.alpha).expect(401);
    });
  });
});
