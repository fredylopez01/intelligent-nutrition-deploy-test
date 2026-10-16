import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
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

interface ProductItem {
  id: string;
  name: string;
  referenceCode: string;
  description: string | null;
  category: { id: string; name: string };
  unitOfMeasure: { id: string; name: string; abbreviation: string };
  price: string;
  active: boolean;
  primaryImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProductsPage {
  data: ProductItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-PL-${runId}`;
const PRODUCT_CODE_PREFIX = `PL-${runId}-`;
const productName = (label: string) => `${runId} ${label}`;

const fixtures = [
  {
    key: "alpha",
    name: productName("Alpha Whey"),
    referenceCode: `${PRODUCT_CODE_PREFIX}WHEY`,
    category: "a",
    unit: "a",
    active: true,
    price: "12500.50",
  },
  {
    key: "beta",
    name: productName("Beta Creatine"),
    referenceCode: `${PRODUCT_CODE_PREFIX}BETA`,
    category: "a",
    unit: "b",
    active: false,
    price: "20000.00",
  },
  {
    key: "gamma",
    name: productName("Gamma BCAA"),
    referenceCode: `${PRODUCT_CODE_PREFIX}GAMMA`,
    category: "b",
    unit: "a",
    active: true,
    price: "15000.00",
  },
  {
    key: "delta",
    name: productName("Delta Protein"),
    referenceCode: `${PRODUCT_CODE_PREFIX}DELTA-CODE`,
    category: "b",
    unit: "b",
    active: false,
    price: "18000.00",
  },
  {
    key: "epsilon",
    name: productName("Epsilon Vitamins"),
    referenceCode: `${PRODUCT_CODE_PREFIX}EPSILON`,
    category: "a",
    unit: "a",
    active: true,
    price: "8000.00",
  },
] as const;

const ALLOWED_ROLES: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
];

describe("GET /api/v1/products (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let documentTypeId = "";
  let categoryAId = "";
  let categoryBId = "";
  let unitAId = "";
  let unitBId = "";
  let alphaProductId = "";
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const productsRequest = (
    query: Record<string, string> = {},
    token?: string,
  ) => {
    const pending = request(app!.getHttpServer())
      .get("/api/v1/products")
      .query(query);
    if (token) pending.set("Authorization", "Bearer " + token);
    return pending;
  };

  const productRequest = (productId: string, token?: string) => {
    const pending = request(app!.getHttpServer()).get(
      `/api/v1/products/${productId}`,
    );
    if (token) pending.set("Authorization", "Bearer " + token);
    return pending;
  };

  const listProducts = async (
    query: Record<string, string> = {},
    token: string = tokens.SUPERADMIN,
  ) => {
    const response = await productsRequest(query, token).expect(200);
    return response.body as ProductsPage;
  };

  const referenceCodesFor = (page: ProductsPage) =>
    page.data.map(({ referenceCode }) => referenceCode);

  const referenceCodesForKeys = (keys: (typeof fixtures)[number]["key"][]) =>
    keys.map((key) => {
      const product = fixtures.find((fixture) => fixture.key === key);
      if (!product) throw new Error(`Unknown product fixture: ${key}`);
      return product.referenceCode;
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
        data: { code: DOCUMENT_CODE, name: "Document (e2e products)" },
      })
    ).id;

    for (const [index, roleName] of [
      ...ALLOWED_ROLES,
      "DEV" as const,
    ].entries()) {
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
          email: `${roleName.toLowerCase()}.products.list.${runId}@e2e.test`,
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
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const categoryA = await database.category.create({
      data: { name: productName("Category A"), active: true },
    });
    categoryAId = categoryA.id;
    const categoryB = await database.category.create({
      data: { name: productName("Category B"), active: true },
    });
    categoryBId = categoryB.id;

    const unitA = await database.unitMeasure.create({
      data: {
        name: productName("Unit A"),
        abreviation: `A${runId.slice(0, 7)}`,
        active: true,
      },
    });
    unitAId = unitA.id;
    const unitB = await database.unitMeasure.create({
      data: {
        name: productName("Unit B"),
        abreviation: `B${runId.slice(0, 7)}`,
        active: true,
      },
    });
    unitBId = unitB.id;

    const categoryIds = { a: categoryAId, b: categoryBId };
    const unitIds = { a: unitAId, b: unitBId };
    await database.product.createMany({
      data: fixtures.map((fixture) => ({
        name: fixture.name,
        referenceCode: fixture.referenceCode,
        description: `Description of ${fixture.name}`,
        categoryId: categoryIds[fixture.category],
        unitOfMeasureId: unitIds[fixture.unit],
        price: fixture.price,
        active: fixture.active,
      })),
    });

    alphaProductId = (
      await database.product.findUniqueOrThrow({
        where: { referenceCode: `${PRODUCT_CODE_PREFIX}WHEY` },
        select: { id: true },
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.product.deleteMany({
          where: { referenceCode: { startsWith: PRODUCT_CODE_PREFIX } },
        });
        await prisma.category.deleteMany({
          where: { id: { in: [categoryAId, categoryBId].filter(Boolean) } },
        });
        await prisma.unitMeasure.deleteMany({
          where: { id: { in: [unitAId, unitBId].filter(Boolean) } },
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

  describe("pagination and response shape", () => {
    it("returns the requested pages and accurate metadata", async () => {
      const firstPage = await listProducts({
        search: runId,
        page: "1",
        limit: "2",
        sortBy: "name",
        sortOrder: "asc",
      });
      const secondPage = await listProducts({
        search: runId,
        page: "2",
        limit: "2",
        sortBy: "name",
        sortOrder: "asc",
      });
      const lastPage = await listProducts({
        search: runId,
        page: "3",
        limit: "2",
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(firstPage.meta).toEqual({
        page: 1,
        limit: 2,
        total: fixtures.length,
        totalPages: 3,
      });
      expect(referenceCodesFor(firstPage)).toEqual(
        referenceCodesForKeys(["alpha", "beta"]),
      );
      expect(referenceCodesFor(secondPage)).toEqual(
        referenceCodesForKeys(["delta", "epsilon"]),
      );
      expect(referenceCodesFor(lastPage)).toEqual(
        referenceCodesForKeys(["gamma"]),
      );
      expect(lastPage.meta).toEqual({
        page: 3,
        limit: 2,
        total: fixtures.length,
        totalPages: 3,
      });
    });

    it("returns the contract fields without the full image list", async () => {
      const page = await listProducts({
        search: "whey",
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(page.data).toHaveLength(1);
      expect(page.data[0]).toMatchObject({
        id: alphaProductId,
        name: fixtures[0].name,
        referenceCode: fixtures[0].referenceCode,
        description: `Description of ${fixtures[0].name}`,
        category: { id: categoryAId, name: productName("Category A") },
        unitOfMeasure: {
          id: unitAId,
          name: productName("Unit A"),
          abbreviation: expect.any(String),
        },
        price: fixtures[0].price,
        active: true,
        primaryImageUrl: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(page.data[0]).not.toHaveProperty("images");
    });
  });

  describe("search and filters", () => {
    it("searches partial, case-insensitive matches in product names", async () => {
      const page = await listProducts({ search: "wHeY" });

      expect(referenceCodesFor(page)).toEqual(referenceCodesForKeys(["alpha"]));
    });

    it("searches partial matches in reference codes", async () => {
      const page = await listProducts({ search: "delta-code" });

      expect(referenceCodesFor(page)).toEqual(referenceCodesForKeys(["delta"]));
    });

    it("filters by categoryId", async () => {
      const page = await listProducts({
        categoryId: categoryAId,
        search: runId,
      });

      expect(referenceCodesFor(page).sort()).toEqual(
        referenceCodesForKeys(["alpha", "beta", "epsilon"]).sort(),
      );
    });

    it("filters by unitOfMeasureId", async () => {
      const page = await listProducts({
        unitOfMeasureId: unitAId,
        search: runId,
      });

      expect(referenceCodesFor(page).sort()).toEqual(
        referenceCodesForKeys(["alpha", "gamma", "epsilon"]).sort(),
      );
    });

    it("filters by active", async () => {
      const page = await listProducts({ active: "false", search: runId });

      expect(referenceCodesFor(page).sort()).toEqual(
        referenceCodesForKeys(["beta", "delta"]).sort(),
      );
    });

    it("combines search and every filter", async () => {
      const page = await listProducts({
        search: "delta-code",
        categoryId: categoryBId,
        unitOfMeasureId: unitBId,
        active: "false",
      });

      expect(referenceCodesFor(page)).toEqual(referenceCodesForKeys(["delta"]));
    });

    it("rejects a search term shorter than two characters", async () => {
      const response = await productsRequest(
        { search: "x" },
        tokens.SUPERADMIN,
      ).expect(400);

      expect((response.body as ApiError).error).toMatchObject({
        code: "SEARCH_TOO_SHORT",
        details: { minLength: 2 },
      });
    });
  });

  describe("product detail", () => {
    it("returns 404 for a product that does not exist", async () => {
      const response = await productRequest(
        randomUUID(),
        tokens.SUPERADMIN,
      ).expect(404);

      expect((response.body as ApiError).error.code).toBe("PRODUCT_NOT_FOUND");
    });
  });

  describe("roles", () => {
    it.each(ALLOWED_ROLES)("allows %s to list products", async (roleName) => {
      await productsRequest({ search: runId }, tokens[roleName]).expect(200);
    });

    it.each(ALLOWED_ROLES)(
      "allows %s to view product details",
      async (roleName) => {
        await productRequest(alphaProductId, tokens[roleName]).expect(200);
      },
    );

    it("denies the DEV role access to the list and detail", async () => {
      const listResponse = await productsRequest({}, tokens.DEV).expect(403);
      const detailResponse = await productRequest(
        alphaProductId,
        tokens.DEV,
      ).expect(403);

      expect((listResponse.body as ApiError).error.code).toBe(
        "INSUFFICIENT_PERMISSIONS",
      );
      expect((detailResponse.body as ApiError).error.code).toBe(
        "INSUFFICIENT_PERMISSIONS",
      );
    });

    it("requires authentication for the list and detail", async () => {
      await productsRequest().expect(401);
      await productRequest(alphaProductId).expect(401);
    });
  });
});
