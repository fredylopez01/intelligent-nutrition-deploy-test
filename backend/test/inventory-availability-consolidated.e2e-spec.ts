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

interface AvailabilityBody {
  product: { id: string; name: string; referenceCode: string };
  branches: { branchId: string; branchName: string; quantity: number }[];
}

interface ConsolidatedRow {
  product: { id: string; name: string; referenceCode: string };
  branchesTotal: number;
  total: number;
  branches: {
    branchId: string;
    branchName: string;
    quantity: number;
    minimumStock: number;
  }[];
}

interface ConsolidatedBody {
  data: ConsolidatedRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-AC-${runId}`;
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
};

const errorOf = (body: unknown) => (body as ApiError).error;

// The service returns `{ data }` and the API may wrap it again, so these
// helpers accept both the wrapped and the unwrapped shapes.
const availabilityOf = (body: unknown): AvailabilityBody => {
  const outer = (body as { data: Record<string, unknown> }).data;
  return ("data" in outer ? outer.data : outer) as AvailabilityBody;
};

const consolidatedOf = (body: unknown): ConsolidatedBody => {
  const root = body as { data: unknown };
  return (Array.isArray(root.data) ? root : root.data) as ConsolidatedBody;
};

describe("Inventory availability and consolidated (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let documentTypeId = "";
  let categoryId = "";
  let otherCategoryId = "";
  let unitOfMeasureId = "";
  let branchA = "";
  let branchB = "";
  let inactiveBranch = "";
  let emptyBranch = "";
  const products = {} as Record<keyof typeof names, string>;
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const authorize = <T extends request.Test>(pending: T, token?: string) => {
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const getAvailability = (
    token?: string,
    query: Record<string, string> = {},
  ) =>
    authorize(
      request(app!.getHttpServer())
        .get("/api/v1/inventory/availability")
        .query(query),
      token,
    );

  const getConsolidated = (
    token?: string,
    query: Record<string, string | number> = {},
  ) =>
    authorize(
      request(app!.getHttpServer())
        .get("/api/v1/inventory/consolidated")
        .query(query),
      token,
    );

  // The database may contain other branches and products, so every assertion
  // only looks at the branches and products created by this suite.
  const ownBranches = () => [branchA, branchB, inactiveBranch, emptyBranch];
  const onlyOwn = (branches: AvailabilityBody["branches"]) =>
    branches.filter((item) => ownBranches().includes(item.branchId));
  const scoped = (extra: Record<string, string | number> = {}) => ({
    search: runId,
    categoryId,
    ...extra,
  });

  const createProduct = (
    key: keyof typeof names,
    code: string,
    productCategoryId: string,
  ) =>
    prisma!.product.create({
      data: {
        name: names[key],
        referenceCode: `AC-${runId}-${code}`,
        categoryId: productCategoryId,
        unitOfMeasureId,
        price: "1000.00",
        active: true,
      },
    });

  const createLot = (
    branchId: string,
    productId: string,
    quantity: number,
    minimumStock: number,
    expirationDate: string,
  ) =>
    prisma!.branchInventory.create({
      data: {
        branchId,
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
        data: { code: DOCUMENT_CODE, name: "Document (e2e availability)" },
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
          email: `${roleName.toLowerCase()}.availability.${runId}@e2e.test`,
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

    const createBranch = async (label: string, active: boolean) =>
      (
        await database.branch.create({
          data: {
            name: `${runId} ${label}`,
            address: "Calle 1 # 2-3",
            phone: "3001112233",
            active,
          },
        })
      ).id;
    branchA = await createBranch("A Branch", true);
    branchB = await createBranch("B Branch", true);
    inactiveBranch = await createBranch("C Inactive Branch", false);
    emptyBranch = await createBranch("D Empty Branch", true);

    // Leader and assistant are only assigned to branch A. Availability must
    // still show them the other branches (documented scope exception).
    for (const roleName of ["BRANCH_LEADER", "BRANCH_ASSISTANT"] as const) {
      await database.userBranch.create({
        data: {
          userId: actorIds[roleName],
          branchId: branchA,
          assignmentDate: new Date(),
          active: true,
        },
      });
    }

    categoryId = (
      await database.category.create({
        data: { name: `${runId} Availability Category`, active: true },
      })
    ).id;
    otherCategoryId = (
      await database.category.create({
        data: { name: `${runId} Other Availability Category`, active: true },
      })
    ).id;
    unitOfMeasureId = (
      await database.unitMeasure.create({
        data: {
          name: `${runId} Availability Unit`,
          abreviation: `AC${runId.slice(-7)}`,
          active: true,
        },
      })
    ).id;

    products.alpha = (await createProduct("alpha", "A", categoryId)).id;
    products.bravo = (await createProduct("bravo", "B", categoryId)).id;
    products.charlie = (
      await createProduct("charlie", "C", otherCategoryId)
    ).id;

    // Alpha: branch A has two lots (3 + 4), branch B has one lot (20).
    await createLot(branchA, products.alpha, 3, 10, "2027-01-01T00:00:00.000Z");
    await createLot(branchA, products.alpha, 4, 10, "2027-02-01T00:00:00.000Z");
    await createLot(branchB, products.alpha, 20, 5, "2027-03-01T00:00:00.000Z");
    // Bravo: only branch B.
    await createLot(branchB, products.bravo, 8, 2, "2027-03-01T00:00:00.000Z");
    // Charlie: stock only in the inactive branch.
    await createLot(inactiveBranch, products.charlie, 5, 1, "2027-03-01T00:00:00.000Z");
  }, 30000);

  afterAll(async () => {
    try {
      if (prisma) {
        const productIds = Object.values(products).filter(Boolean);
        const branchIds = ownBranches().filter(Boolean);
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

  describe("GET /inventory/availability", () => {
    it("sums the lots of each active branch, ordered by branch name", async () => {
      const response = await getAvailability(tokens.SUPERADMIN, {
        productId: products.alpha,
      }).expect(200);
      const result = availabilityOf(response.body);

      expect(result.product).toEqual({
        id: products.alpha,
        name: names.alpha,
        referenceCode: `AC-${runId}-A`,
      });
      expect(onlyOwn(result.branches)).toEqual([
        { branchId: branchA, branchName: `${runId} A Branch`, quantity: 7 },
        { branchId: branchB, branchName: `${runId} B Branch`, quantity: 20 },
        { branchId: emptyBranch, branchName: `${runId} D Empty Branch`, quantity: 0 },
      ]);
    });

    it("excludes inactive branches even when they hold stock", async () => {
      const response = await getAvailability(tokens.SUPERADMIN, {
        productId: products.charlie,
      }).expect(200);
      const branches = onlyOwn(availabilityOf(response.body).branches);

      expect(branches.map((item) => item.branchId)).toEqual([
        branchA,
        branchB,
        emptyBranch,
      ]);
      expect(branches.map((item) => item.quantity)).toEqual([0, 0, 0]);
      expect(branches.map((item) => item.branchId)).not.toContain(
        inactiveBranch,
      );
    });

    it("exposes only branch id, name and quantity, with no financial data or minimums", async () => {
      const response = await getAvailability(tokens.SUPERADMIN, {
        productId: products.alpha,
      }).expect(200);
      const result = availabilityOf(response.body);

      expect(Object.keys(result).sort()).toEqual(["branches", "product"]);
      expect(Object.keys(result.product).sort()).toEqual([
        "id",
        "name",
        "referenceCode",
      ]);
      for (const item of result.branches) {
        expect(Object.keys(item).sort()).toEqual([
          "branchId",
          "branchName",
          "quantity",
        ]);
      }
      const serialized = JSON.stringify(response.body);
      for (const hidden of ["minimumStock", "lowStock", "price", "lots"]) {
        expect(serialized).not.toContain(hidden);
      }
    });

    it.each(["BRANCH_LEADER", "BRANCH_ASSISTANT"] as const)(
      "lets %s see branches outside their assignment without minimums",
      async (roleName) => {
        const response = await getAvailability(tokens[roleName], {
          productId: products.alpha,
        }).expect(200);
        const branches = onlyOwn(availabilityOf(response.body).branches);

        expect(branches.map((item) => [item.branchId, item.quantity])).toEqual([
          [branchA, 7],
          [branchB, 20],
          [emptyBranch, 0],
        ]);
        expect(JSON.stringify(response.body)).not.toContain("minimumStock");
      },
    );

    it.each([
      ["missing productId", {}],
      ["empty productId", { productId: "" }],
      ["malformed productId", { productId: "not-a-uuid" }],
    ])("rejects %s", async (_label, query) => {
      const response = await getAvailability(tokens.SUPERADMIN, query).expect(
        400,
      );

      expect(errorOf(response.body).code).toEqual(expect.any(String));
    });

    it("returns 404 when the product does not exist", async () => {
      const response = await getAvailability(tokens.SUPERADMIN, {
        productId: randomUUID(),
      }).expect(404);

      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
    });

    it("denies DEV access", async () => {
      const response = await getAvailability(tokens.DEV, {
        productId: products.alpha,
      }).expect(403);

      expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
    });

    it("requires authentication", async () => {
      await getAvailability(undefined, { productId: products.alpha }).expect(
        401,
      );
    });
  });

  describe("GET /inventory/consolidated", () => {
    it("returns the total and the breakdown by branch for each product", async () => {
      const response = await getConsolidated(
        tokens.SUPERADMIN,
        scoped(),
      ).expect(200);
      const body = consolidatedOf(response.body);

      expect(body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
      expect(body.data.map((row) => row.product.name)).toEqual([
        names.alpha,
        names.bravo,
      ]);

      const [alpha, bravo] = body.data;
      const byBranchName = (
        branches: ConsolidatedRow["branches"],
      ): ConsolidatedRow["branches"] =>
        [...branches].sort((a, b) => a.branchName.localeCompare(b.branchName));

      expect(alpha.product).toEqual({
        id: products.alpha,
        name: names.alpha,
        referenceCode: `AC-${runId}-A`,
      });
      expect(alpha.branchesTotal).toBe(27);
      expect(alpha.total).toBe(27);
      expect(byBranchName(alpha.branches)).toEqual([
        { branchId: branchA, branchName: `${runId} A Branch`, quantity: 7, minimumStock: 10 },
        { branchId: branchB, branchName: `${runId} B Branch`, quantity: 20, minimumStock: 5 },
      ]);
      expect(bravo.branchesTotal).toBe(8);
      expect(bravo.total).toBe(8);
      expect(bravo.branches).toEqual([
        { branchId: branchB, branchName: `${runId} B Branch`, quantity: 8, minimumStock: 2 },
      ]);
    });

    it("keeps total equal to branchesTotal and to the sum of the breakdown", async () => {
      const response = await getConsolidated(
        tokens.SUPERADMIN,
        scoped(),
      ).expect(200);

      for (const row of consolidatedOf(response.body).data) {
        const sum = row.branches.reduce((acc, item) => acc + item.quantity, 0);
        expect(row.total).toBe(row.branchesTotal);
        expect(row.branchesTotal).toBe(sum);
      }
    });

    it("paginates the results", async () => {
      const first = await getConsolidated(
        tokens.SUPERADMIN,
        scoped({ page: 1, limit: 1 }),
      ).expect(200);
      const second = await getConsolidated(
        tokens.SUPERADMIN,
        scoped({ page: 2, limit: 1 }),
      ).expect(200);

      expect(consolidatedOf(first.body).data.map((row) => row.product.name)).toEqual([names.alpha]);
      expect(consolidatedOf(first.body).meta).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(consolidatedOf(second.body).data.map((row) => row.product.name)).toEqual([names.bravo]);
    });

    it("searches by product name ignoring case", async () => {
      const response = await getConsolidated(tokens.SUPERADMIN, {
        search: names.bravo.toUpperCase(),
        categoryId,
      }).expect(200);

      expect(
        consolidatedOf(response.body).data.map((row) => row.product.name),
      ).toEqual([names.bravo]);
    });

    it("searches by reference code", async () => {
      const response = await getConsolidated(tokens.SUPERADMIN, {
        search: `ac-${runId}-a`,
        categoryId,
      }).expect(200);

      expect(
        consolidatedOf(response.body).data.map((row) => row.product.name),
      ).toEqual([names.alpha]);
    });

    it("returns an empty page when nothing matches", async () => {
      const response = await getConsolidated(tokens.SUPERADMIN, {
        search: "zzzz-no-match",
      }).expect(200);

      expect(consolidatedOf(response.body)).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it("rejects a search shorter than two characters", async () => {
      const response = await getConsolidated(tokens.SUPERADMIN, {
        search: "a",
      }).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        code: "SEARCH_TOO_SHORT",
        details: { minLength: 2 },
      });
    });

    it.each([
      ["page below 1", { page: 0 }],
      ["limit above 100", { limit: 101 }],
      ["malformed categoryId", { categoryId: "not-a-uuid" }],
      ["unknown query parameter", { foo: "bar" }],
    ])("rejects %s", async (_label, query) => {
      const response = await getConsolidated(tokens.SUPERADMIN, query).expect(
        400,
      );

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it.each(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"] as const)(
      "denies %s access (SUPERADMIN only)",
      async (roleName) => {
        const response = await getConsolidated(
          tokens[roleName],
          scoped(),
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      },
    );

    it("requires authentication", async () => {
      await getConsolidated(undefined, scoped()).expect(401);
    });
  });
});
