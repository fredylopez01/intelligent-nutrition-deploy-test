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

const ALLOWED_ROLES: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
];

const DENIED_ROLE: RoleName = "DEV";

interface PaymentMethodItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PaymentMethodsPage {
  data: PaymentMethodItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

type FixtureKey = "alfa" | "beta" | "delta" | "epsilon" | "gamma";

const runId = Date.now().toString(36);
const codePrefix = runId.toUpperCase();

const fixturePaymentMethods: Record<
  FixtureKey,
  { code: string; name: string; active: boolean }
> = {
  alfa: { code: `${codePrefix}_ALFA`, name: `${runId} Alfa`, active: true },
  beta: { code: `${codePrefix}_BETA`, name: `${runId} Beta`, active: true },
  delta: { code: `${codePrefix}_DELTA`, name: `${runId} Delta`, active: false },
  epsilon: {
    code: `${codePrefix}_EPSILON`,
    name: `${runId} Epsilon`,
    active: true,
  },
  gamma: { code: `${codePrefix}_GAMMA`, name: `${runId} Gamma`, active: true },
};

const BY_NAME_ASC: FixtureKey[] = ["alfa", "beta", "delta", "epsilon", "gamma"];

const nameOf = (key: FixtureKey) => fixturePaymentMethods[key].name;
const namesOfKeys = (keys: FixtureKey[]) => keys.map(nameOf);

describe("GET /api/v1/payment-methods (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;

  const listPaymentMethods = async (
    query: Record<string, string> = {},
    token: string = tokens.SUPERADMIN,
  ) => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/payment-methods")
      .set("Authorization", `Bearer ${token}`)
      .query(query)
      .expect(200);
    return response.body as PaymentMethodsPage;
  };

  const namesOf = (items: PaymentMethodItem[]) => items.map(({ name }) => name);

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

    documentTypeId = (
      await prisma.documentType.upsert({
        where: { code: `PM-LIST-${codePrefix}` },
        update: { active: true },
        create: {
          code: `PM-LIST-${codePrefix}`,
          name: "Cédula (e2e listar métodos de pago)",
        },
      })
    ).id;

    const roleNames: RoleName[] = [
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
      "DEV",
    ];

    for (const roleName of roleNames) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${codePrefix}${sequence++}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.payment-methods-list.${runId}@e2e.test`,
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
      actorIds[roleName] = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    for (const key of Object.keys(fixturePaymentMethods) as FixtureKey[]) {
      await prisma.paymentMethod.create({ data: fixturePaymentMethods[key] });
    }
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.paymentMethod.deleteMany({
        where: { code: { startsWith: `${codePrefix}_` } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: Object.values(actorIds) } },
      });
      await prisma.person.deleteMany({
        where: { id: { in: Object.values(actorIds) } },
      });

      const documentType = await prisma.documentType.findUnique({
        where: { code: `PM-LIST-${codePrefix}` },
      });
      if (documentType) {
        const peopleStillUsingType = await prisma.person.count({
          where: { documentTypeId: documentType.id },
        });
        if (peopleStillUsingType === 0) {
          await prisma.documentType.delete({ where: { id: documentType.id } });
        }
      }
    } finally {
      await app.close();
    }
  }, 30000);

  describe("without filters", () => {
    it("returns every fixture payment method with exactly the public fields", async () => {
      const page = await listPaymentMethods(onlyOurs);

      expect(Object.keys(page).sort()).toEqual(["data", "meta"]);
      expect(namesOf(page.data)).toEqual(namesOfKeys(BY_NAME_ASC));
      expect(Object.keys(page.data[0]).sort()).toEqual(
        ["active", "code", "createdAt", "id", "name", "updatedAt"].sort(),
      );
      expect(
        page.data.find(({ code }) => code === fixturePaymentMethods.alfa.code),
      ).toEqual({
        id: expect.any(String),
        code: fixturePaymentMethods.alfa.code,
        name: nameOf("alfa"),
        active: true,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it("applies the default pagination", async () => {
      const page = await listPaymentMethods();
      const total = await prisma.paymentMethod.count();

      expect(page.meta).toEqual({
        page: 1,
        limit: 10,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / 10),
      });
      expect(page.data.length).toBeLessThanOrEqual(10);
    });
  });

  describe("pagination", () => {
    it("returns the first page with the requested limit", async () => {
      const page = await listPaymentMethods({
        search: runId,
        limit: "2",
        page: "1",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["alfa", "beta"]));
      expect(page.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    });

    it("returns the following pages, the last one with the leftovers", async () => {
      const second = await listPaymentMethods({
        search: runId,
        limit: "2",
        page: "2",
      });
      const third = await listPaymentMethods({
        search: runId,
        limit: "2",
        page: "3",
      });

      expect(namesOf(second.data)).toEqual(namesOfKeys(["delta", "epsilon"]));
      expect(namesOf(third.data)).toEqual(namesOfKeys(["gamma"]));
    });

    it("returns an empty page, with the real totals, past the last page", async () => {
      const page = await listPaymentMethods({
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
      const response = await request(app.getHttpServer())
        .get("/api/v1/payment-methods")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query(query)
        .expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("filter by status", () => {
    it("returns only active payment methods", async () => {
      const page = await listPaymentMethods({ ...onlyOurs, active: "true" });

      expect(page.data.every(({ active }) => active)).toBe(true);
      expect(namesOf(page.data)).toEqual(
        namesOfKeys(["alfa", "beta", "epsilon", "gamma"]),
      );
      expect(page.meta.total).toBe(4);
    });

    it("returns only inactive payment methods", async () => {
      const page = await listPaymentMethods({ ...onlyOurs, active: "false" });

      expect(page.data.every(({ active }) => !active)).toBe(true);
      expect(namesOf(page.data)).toEqual(namesOfKeys(["delta"]));
      expect(page.meta.total).toBe(1);
    });

    it("rejects a status that is not true or false", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/payment-methods")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query({ active: "maybe" })
        .expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("search", () => {
    it("matches part of the name ignoring case", async () => {
      const page = await listPaymentMethods({
        search: `${codePrefix} GA`,
        limit: "100",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["gamma"]));
    });

    it("matches part of the code ignoring case", async () => {
      const page = await listPaymentMethods({
        search: `${runId}_alf`,
        limit: "100",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["alfa"]));
    });

    it("ignores spaces around the search term", async () => {
      const page = await listPaymentMethods({
        search: `   ${runId} beta   `,
        limit: "100",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["beta"]));
    });

    it("ignores a search made only of spaces", async () => {
      const page = await listPaymentMethods({ search: "   " });
      const total = await prisma.paymentMethod.count();

      expect(page.meta).toMatchObject({ page: 1, limit: 10, total });
      expect(page.data.length).toBeLessThanOrEqual(10);
    });

    it("returns an empty page when nothing matches", async () => {
      const page = await listPaymentMethods({
        search: `${runId} sin-coincidencias`,
      });

      expect(page.data).toEqual([]);
      expect(page.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it("narrows the search with the active flag", async () => {
      const page = await listPaymentMethods({
        search: `${runId} delta`,
        active: "false",
        limit: "100",
      });

      expect(namesOf(page.data)).toEqual(namesOfKeys(["delta"]));
      expect(page.meta.total).toBe(1);
    });
  });

  describe("access", () => {
    it("rejects the list without an access token", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/payment-methods")
        .expect(401);
    });

    it.each<RoleName>(ALLOWED_ROLES)(
      "allows the %s role to list payment methods",
      async (roleName) => {
        const page = await listPaymentMethods(onlyOurs, tokens[roleName]);

        expect(page.data).toHaveLength(5);
      },
    );

    it(`denies the ${DENIED_ROLE} role`, async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/payment-methods")
        .set("Authorization", `Bearer ${tokens[DENIED_ROLE]}`)
        .expect(403);

      expect(response.body).toMatchObject({
        error: { code: "INSUFFICIENT_PERMISSIONS" },
      });
    });
  });
});
