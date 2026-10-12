import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

const NO_ACCESS_ROLE = "E2E_NO_ACCESS";
type TokenKey = RoleName | typeof NO_ACCESS_ROLE;

const ALLOWED_ROLES: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CategoriesPage {
  data: CategoryItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

type FixtureKey =
  "aminoacidos" | "creatinas" | "proteinas" | "veganas" | "vitaminas";

const runId = Date.now().toString(36);

const fixtureCategories: Record<
  FixtureKey,
  { name: string; description: string; active: boolean; createdAt: Date }
> = {
  aminoacidos: {
    name: `${runId} Aminoacidos`,
    description: `${runId} Aminoacidos esenciales`,
    active: true,
    createdAt: new Date("2024-01-03T12:00:00.000Z"),
  },
  creatinas: {
    name: `${runId} Creatinas`,
    description: `${runId} Creatinas monohidratadas`,
    active: true,
    createdAt: new Date("2024-01-05T12:00:00.000Z"),
  },
  proteinas: {
    name: `${runId} Proteinas`,
    description: `${runId} Proteinas de suero`,
    active: true,
    createdAt: new Date("2024-01-02T12:00:00.000Z"),
  },
  veganas: {
    name: `${runId} Proteinas Veganas`,
    description: `${runId} Proteinas de origen vegetal`,
    active: false,
    createdAt: new Date("2024-01-04T12:00:00.000Z"),
  },
  vitaminas: {
    name: `${runId} Vitaminas`,
    description: `${runId} Vitaminas y minerales`,
    active: true,
    createdAt: new Date("2024-01-01T12:00:00.000Z"),
  },
};

const BY_NAME_ASC: FixtureKey[] = [
  "aminoacidos",
  "creatinas",
  "proteinas",
  "veganas",
  "vitaminas",
];
const BY_CREATED_AT_ASC: FixtureKey[] = [
  "vitaminas",
  "proteinas",
  "aminoacidos",
  "veganas",
  "creatinas",
];

const nameOf = (key: FixtureKey) => fixtureCategories[key].name;
const namesOfKeys = (keys: FixtureKey[]) => keys.map(nameOf);

describe("GET /api/v1/categories (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<TokenKey, string>;
  const categoryIds = {} as Record<FixtureKey, string>;
  const personIds: string[] = [];

  const listCategories = async (
    query: Record<string, string> = {},
    token: string = tokens.SUPERADMIN,
  ) => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .query(query)
      .expect(200);
    return response.body as CategoriesPage;
  };

  const getCategory = (id: string, token: string = tokens.SUPERADMIN) =>
    request(app.getHttpServer())
      .get(`/api/v1/categories/${id}`)
      .set("Authorization", `Bearer ${token}`);

  const namesOf = (items: CategoryItem[]) => items.map(({ name }) => name);

  const onlyOurs = { search: runId, limit: "100" };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const jwtService = app.get(JwtService);

    const documentType = await prisma.documentType.upsert({
      where: { code: "CC-E2E-CAT" },
      update: { active: true },
      create: { code: "CC-E2E-CAT", name: "CC (e2e categorias)" },
    });

    const roleNames: TokenKey[] = [...ALLOWED_ROLES, NO_ACCESS_ROLE];

    for (const [index, roleName] of roleNames.entries()) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId: documentType.id,
          documentNumber: `${runId}${index}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.categories.${runId}@e2e.test`,
          phone: "6017000000",
          address: "Calle 1 # 2-3",
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

    for (const key of Object.keys(fixtureCategories) as FixtureKey[]) {
      const category = await prisma.category.create({
        data: fixtureCategories[key],
      });
      categoryIds[key] = category.id;
    }
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.category.deleteMany({
        where: { name: { startsWith: runId } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: personIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });

      const noAccessRole = await prisma.role.findUnique({
        where: { name: NO_ACCESS_ROLE },
      });
      if (noAccessRole) {
        const accountsStillUsingRole = await prisma.userAccount.count({
          where: { roleId: noAccessRole.id },
        });
        if (accountsStillUsingRole === 0) {
          await prisma.role.delete({ where: { id: noAccessRole.id } });
        }
      }

      const documentType = await prisma.documentType.findUnique({
        where: { code: "CC-E2E-CAT" },
      });
      if (documentType) {
        const peopleStillUsingType = await prisma.person.count({
          where: { documentTypeId: documentType.id },
        });
        if (peopleStillUsingType === 0) {
          await prisma.documentType.delete({
            where: { id: documentType.id },
          });
        }
      }
    } finally {
      await app.close();
    }
  }, 30000);

  describe("without filters", () => {
    it("returns every fixture category with exactly the public fields", async () => {
      const page = await listCategories(onlyOurs);

      expect(namesOf(page.data)).toEqual(namesOfKeys(BY_NAME_ASC));
      const proteinas = page.data.find(
        ({ name }) => name === nameOf("proteinas"),
      );
      expect(proteinas).toEqual({
        id: categoryIds.proteinas,
        name: nameOf("proteinas"),
        description: fixtureCategories.proteinas.description,
        active: true,
        createdAt: "2024-01-02T12:00:00.000Z",
        updatedAt: expect.any(String),
      });
    });

    it("applies the default pagination", async () => {
      const page = await listCategories();
      const total = await prisma.category.count();

      expect(page.meta).toEqual({
        page: 1,
        limit: 10,
        total,
        totalPages: Math.ceil(total / 10),
      });
      expect(page.data.length).toBeLessThanOrEqual(10);
    });
  });

  describe("pagination", () => {
    it("returns the first page with the requested limit", async () => {
      const page = await listCategories({
        search: runId,
        limit: "2",
        page: "1",
      });

      expect(namesOf(page.data)).toEqual(
        namesOfKeys(["aminoacidos", "creatinas"]),
      );
      expect(page.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    });

    it("returns the following pages, the last one with the leftovers", async () => {
      const second = await listCategories({
        search: runId,
        limit: "2",
        page: "2",
      });
      const third = await listCategories({
        search: runId,
        limit: "2",
        page: "3",
      });

      expect(namesOf(second.data)).toEqual(
        namesOfKeys(["proteinas", "veganas"]),
      );
      expect(namesOf(third.data)).toEqual(namesOfKeys(["vitaminas"]));
    });

    it("returns an empty page, with the real totals, past the last page", async () => {
      const page = await listCategories({
        search: runId,
        limit: "2",
        page: "4",
      });

      expect(page.data).toEqual([]);
      expect(page.meta).toEqual({ page: 4, limit: 2, total: 5, totalPages: 3 });
    });

    it.each<[string, Record<string, string>]>([
      ["page below 1", { page: "0" }],
      ["limit below 1", { limit: "0" }],
      ["limit above 100", { limit: "101" }],
      ["a limit that is not a number", { limit: "abc" }],
    ])("rejects %s", async (_label, query) => {
      await request(app.getHttpServer())
        .get("/api/v1/categories")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query(query)
        .expect(400);
    });
  });

  describe("ordering", () => {
    it("sorts by name ascending by default", async () => {
      const page = await listCategories(onlyOurs);

      expect(namesOf(page.data)).toEqual(namesOfKeys(BY_NAME_ASC));
    });

    it("sorts by name descending", async () => {
      const page = await listCategories({
        ...onlyOurs,
        sortBy: "name",
        sortOrder: "desc",
      });

      expect(namesOf(page.data)).toEqual(
        namesOfKeys([...BY_NAME_ASC].reverse()),
      );
    });

    it("sorts by creation date ascending", async () => {
      const page = await listCategories({
        ...onlyOurs,
        sortBy: "createdAt",
        sortOrder: "asc",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(BY_CREATED_AT_ASC));
    });

    it("sorts by creation date descending, accepting uppercase", async () => {
      const page = await listCategories({
        ...onlyOurs,
        sortBy: "createdAt",
        sortOrder: "DESC",
      });

      expect(namesOf(page.data)).toEqual(
        namesOfKeys([...BY_CREATED_AT_ASC].reverse()),
      );
    });

    it.each<[string, Record<string, string>]>([
      ["a sortBy that is not allowed", { sortBy: "description" }],
      ["a sortOrder that is not asc or desc", { sortOrder: "sideways" }],
    ])("rejects %s", async (_label, query) => {
      await request(app.getHttpServer())
        .get("/api/v1/categories")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query(query)
        .expect(400);
    });
  });

  describe("search", () => {
    it("matches part of the name ignoring case", async () => {
      const page = await listCategories({
        search: `${runId} PROTEIN`,
        limit: "100",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["proteinas", "veganas"]));
    });

    it("ignores spaces around the search term", async () => {
      const page = await listCategories({
        search: `   ${runId} vitaminas   `,
        limit: "100",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["vitaminas"]));
    });

    it("returns an empty page when nothing matches", async () => {
      const page = await listCategories({
        search: `${runId} sin-coincidencias`,
      });

      expect(page.data).toEqual([]);
      expect(page.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it("narrows the search with the active flag", async () => {
      const page = await listCategories({
        search: `${runId} proteinas`,
        active: "true",
        limit: "100",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["proteinas"]));
    });
  });

  describe("SEARCH_TOO_SHORT", () => {
    const expectTooShort = async (search: string) => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/categories")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query({ search })
        .expect(400);

      expect((response.body as ApiError).error.code).toBe("SEARCH_TOO_SHORT");
    };

    it("rejects a one-character search", async () => {
      await expectTooShort("a");
    });

    it("accepts a search of exactly the minimum length (2 characters)", async () => {
      await listCategories({ search: "pr" });
    });

    describe("edge cases (confirm the expected behavior with backend)", () => {
      it("rejects a search made only of spaces", async () => {
        await expectTooShort("   ");
      });

      it("rejects an empty search term", async () => {
        await expectTooShort("");
      });
    });
  });

  describe("filter by status", () => {
    it("returns only active categories", async () => {
      const page = await listCategories({ ...onlyOurs, active: "true" });

      expect(page.data.every(({ active }) => active)).toBe(true);
      expect(namesOf(page.data)).toEqual(
        namesOfKeys(["aminoacidos", "creatinas", "proteinas", "vitaminas"]),
      );
    });

    it("returns only inactive categories", async () => {
      const page = await listCategories({ ...onlyOurs, active: "false" });

      expect(page.data.every(({ active }) => !active)).toBe(true);
      expect(namesOf(page.data)).toEqual(namesOfKeys(["veganas"]));
    });

    it("rejects a status that is not true or false", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/categories")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query({ active: "maybe" })
        .expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("GET /api/v1/categories/:categoryId", () => {
    it("returns the category with the public fields", async () => {
      const response = await getCategory(categoryIds.proteinas).expect(200);

      expect(response.body).toEqual({
        data: {
          id: categoryIds.proteinas,
          name: nameOf("proteinas"),
          description: fixtureCategories.proteinas.description,
          active: true,
          createdAt: "2024-01-02T12:00:00.000Z",
          updatedAt: expect.any(String),
        },
      });
    });

    it("also returns an inactive category", async () => {
      const response = await getCategory(categoryIds.veganas).expect(200);

      expect(response.body).toMatchObject({
        data: { id: categoryIds.veganas, active: false },
      });
    });

    it("returns 404 when the category does not exist", async () => {
      const response = await getCategory(randomUUID()).expect(404);

      expect((response.body as ApiError).error.code).toBe("NOT_FOUND");
    });

    it("returns 400 when the id is not a UUID", async () => {
      await getCategory("not-a-uuid").expect(400);
    });
  });

  describe("access", () => {
    it("rejects the list without an access token", async () => {
      await request(app.getHttpServer()).get("/api/v1/categories").expect(401);
    });

    it("rejects the detail without an access token", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/categories/${categoryIds.proteinas}`)
        .expect(401);
    });

    it.each<RoleName>(ALLOWED_ROLES)(
      "allows the %s role to list categories",
      async (roleName) => {
        const page = await listCategories(onlyOurs, tokens[roleName]);

        expect(page.data).toHaveLength(5);
      },
    );

    it.each<RoleName>(ALLOWED_ROLES)(
      "allows the %s role to read a category",
      async (roleName) => {
        await getCategory(categoryIds.proteinas, tokens[roleName]).expect(200);
      },
    );

    it("denies the list to a role that is not allowed", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/categories")
        .set("Authorization", `Bearer ${tokens[NO_ACCESS_ROLE]}`)
        .expect(403);

      expect(response.body).toMatchObject({
        error: { code: "INSUFFICIENT_PERMISSIONS" },
      });
    });

    it("denies the detail to a role that is not allowed", async () => {
      const response = await getCategory(
        categoryIds.proteinas,
        tokens[NO_ACCESS_ROLE],
      ).expect(403);

      expect(response.body).toMatchObject({
        error: { code: "INSUFFICIENT_PERMISSIONS" },
      });
    });
  });
});
