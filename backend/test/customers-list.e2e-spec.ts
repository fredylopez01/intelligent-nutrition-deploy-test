import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT";

const NO_ACCESS_ROLE = "E2E_NO_ACCESS";
type TokenKey = RoleName | typeof NO_ACCESS_ROLE;

const ALLOWED_ROLES: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
];

interface CustomerItem {
  id: string;
  fullName: string;
  active: boolean;
  person: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    documentNumber: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    documentType: { code: string; name: string } | null;
  };
}

interface CustomersPage {
  data: CustomerItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

type FixtureKey = "alice" | "bob" | "carlos" | "delta" | "echo";

const runId = Date.now().toString(36);

const DOCUMENT_TYPE_CODE = "CC-CUST-LIST-E2E";

// Five fixtures: 3 active (alice, bob, delta), 2 inactive (carlos, echo).
// All fullNames start with runId so onlyOurs isolates them.
// Individual contacts: alice, bob, carlos. Business contacts: delta, echo.
const fixtureData: Record<
  FixtureKey,
  {
    person: {
      firstName?: string;
      lastName?: string;
      businessName?: string;
      documentNumber: string;
      email: string;
      phone: string;
      address: string;
    };
    fullName: string;
    active: boolean;
  }
> = {
  alice: {
    person: {
      firstName: `${runId}Alice`,
      lastName: "Martin",
      documentNumber: `${runId}CL1`,
      email: `alice.${runId}@e2e.test`,
      phone: "6011000001",
      address: "Calle 1 # 1-1",
    },
    fullName: `${runId} Alice Martin`,
    active: true,
  },
  bob: {
    person: {
      firstName: `${runId}Bob`,
      lastName: `${runId}Torres`,
      documentNumber: `${runId}CL2`,
      email: `bob.${runId}@e2e.test`,
      phone: "6011000002",
      address: "Calle 2 # 2-2",
    },
    fullName: `${runId} Bob Torres`,
    active: true,
  },
  carlos: {
    person: {
      firstName: `${runId}Carlos`,
      lastName: "Vega",
      documentNumber: `${runId}CL3`,
      email: `carlos.${runId}@e2e.test`,
      phone: "6011000003",
      address: "Calle 3 # 3-3",
    },
    fullName: `${runId} Carlos Vega`,
    active: false,
  },
  delta: {
    person: {
      businessName: `${runId}DeltaCorp`,
      documentNumber: `${runId}CL4`,
      email: `delta.${runId}@e2e.test`,
      phone: "6011000004",
      address: "Calle 4 # 4-4",
    },
    fullName: `${runId} Delta Corp`,
    active: true,
  },
  echo: {
    person: {
      businessName: `${runId}EchoSupp`,
      documentNumber: `${runId}CL5`,
      email: `echo.${runId}@e2e.test`,
      phone: "6011000005",
      address: "Calle 5 # 5-5",
    },
    fullName: `${runId} Echo Supp`,
    active: false,
  },
};

// Alphabetical order by the part of fullName after the runId prefix.
const BY_FULL_NAME_ASC: FixtureKey[] = [
  "alice",
  "bob",
  "carlos",
  "delta",
  "echo",
];

const fullNameOf = (key: FixtureKey) => fixtureData[key].fullName;
const fullNamesOfKeys = (keys: FixtureKey[]) => keys.map(fullNameOf);

describe("GET /api/v1/customers (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<TokenKey, string>;
  const actorPersonIds: string[] = [];
  const customerPersonIds: string[] = [];
  const customerIds = {} as Record<FixtureKey, string>;

  const listCustomers = async (
    query: Record<string, string> = {},
    token: string = tokens.SUPERADMIN,
  ) => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/customers")
      .set("Authorization", `Bearer ${token}`)
      .query(query)
      .expect(200);
    return response.body as CustomersPage;
  };

  const fullNamesOf = (items: CustomerItem[]) =>
    items.map(({ fullName }) => fullName);

  // Filters the list to our fixtures only (all fullNames contain the runId).
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
      where: { code: DOCUMENT_TYPE_CODE },
      update: { active: true },
      create: { code: DOCUMENT_TYPE_CODE, name: "CC (e2e customers list)" },
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
          documentNumber: `${runId}A${index}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.custlist.${runId}@e2e.test`,
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
      actorPersonIds.push(person.id);
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    for (const key of Object.keys(fixtureData) as FixtureKey[]) {
      const { person: personData, fullName, active } = fixtureData[key];
      const person = await prisma.person.create({
        data: { documentTypeId: documentType.id, ...personData },
      });
      customerPersonIds.push(person.id);
      await prisma.customer.create({
        data: { personId: person.id, fullName, active },
      });
      customerIds[key] = person.id;
    }
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.customer.deleteMany({
        where: { personId: { in: customerPersonIds } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: actorPersonIds } },
      });
      await prisma.person.deleteMany({
        where: { id: { in: [...actorPersonIds, ...customerPersonIds] } },
      });

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
        where: { code: DOCUMENT_TYPE_CODE },
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
    it("returns every fixture customer with exactly the public fields", async () => {
      const page = await listCustomers(onlyOurs);

      expect(fullNamesOf(page.data)).toEqual(fullNamesOfKeys(BY_FULL_NAME_ASC));

      const alice = page.data.find(
        ({ fullName }) => fullName === fullNameOf("alice"),
      );
      expect(alice).toEqual({
        id: customerIds.alice,
        fullName: fullNameOf("alice"),
        active: true,
        person: {
          id: customerIds.alice,
          firstName: fixtureData.alice.person.firstName ?? null,
          lastName: fixtureData.alice.person.lastName ?? null,
          businessName: null,
          documentNumber: fixtureData.alice.person.documentNumber,
          email: fixtureData.alice.person.email,
          phone: fixtureData.alice.person.phone,
          address: fixtureData.alice.person.address,
          documentType: {
            code: DOCUMENT_TYPE_CODE,
            name: "CC (e2e customers list)",
          },
        },
      });
    });

    it("does not include createdAt or updatedAt in list items", async () => {
      const page = await listCustomers(onlyOurs);
      const item = page.data[0];

      expect(item).not.toHaveProperty("createdAt");
      expect(item).not.toHaveProperty("updatedAt");
    });

    it("applies the default pagination", async () => {
      const page = await listCustomers();
      const total = await prisma.customer.count();

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
      const page = await listCustomers({
        search: runId,
        limit: "2",
        page: "1",
      });

      expect(fullNamesOf(page.data)).toEqual(
        fullNamesOfKeys(["alice", "bob"]),
      );
      expect(page.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    });

    it("returns the following pages, the last one with the leftovers", async () => {
      const second = await listCustomers({
        search: runId,
        limit: "2",
        page: "2",
      });
      const third = await listCustomers({
        search: runId,
        limit: "2",
        page: "3",
      });

      expect(fullNamesOf(second.data)).toEqual(
        fullNamesOfKeys(["carlos", "delta"]),
      );
      expect(fullNamesOf(third.data)).toEqual(fullNamesOfKeys(["echo"]));
    });

    it("returns an empty page, with the real totals, past the last page", async () => {
      const page = await listCustomers({
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
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query(query)
        .expect(400);
    });
  });

  describe("search", () => {
    it("matches part of the fullName ignoring case", async () => {
      const page = await listCustomers({
        search: `${runId} ALICE`,
        limit: "100",
      });

      expect(fullNamesOf(page.data)).toEqual(fullNamesOfKeys(["alice"]));
    });

    it("matches the person's first name", async () => {
      const page = await listCustomers({
        search: `${runId}Bob`,
        limit: "100",
      });

      expect(fullNamesOf(page.data)).toEqual(fullNamesOfKeys(["bob"]));
    });

    it("matches the person's last name", async () => {
      // bob.person.lastName = `${runId}Torres` — unique to bob's person record
      const page = await listCustomers({
        search: `${runId}Torres`,
        limit: "100",
      });

      expect(fullNamesOf(page.data)).toEqual(fullNamesOfKeys(["bob"]));
    });

    it("matches the person's business name", async () => {
      const page = await listCustomers({
        search: `${runId}DeltaCorp`,
        limit: "100",
      });

      expect(fullNamesOf(page.data)).toEqual(fullNamesOfKeys(["delta"]));
    });

    it("matches the person's document number", async () => {
      const page = await listCustomers({
        search: `${runId}CL3`,
        limit: "100",
      });

      expect(fullNamesOf(page.data)).toEqual(fullNamesOfKeys(["carlos"]));
    });

    it("ignores spaces around the search term", async () => {
      const page = await listCustomers({
        search: `   ${runId} Alice   `,
        limit: "100",
      });

      expect(fullNamesOf(page.data)).toEqual(fullNamesOfKeys(["alice"]));
    });

    it("returns an empty page when nothing matches", async () => {
      const page = await listCustomers({
        search: `${runId}-sin-coincidencias`,
      });

      expect(page.data).toEqual([]);
      expect(page.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it("narrows the search with the active flag", async () => {
      const page = await listCustomers({
        search: runId,
        active: "false",
        limit: "100",
      });

      expect(fullNamesOf(page.data)).toEqual(
        fullNamesOfKeys(["carlos", "echo"]),
      );
    });
  });

  describe("SEARCH_TOO_SHORT", () => {
    const expectTooShort = async (search: string) => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query({ search })
        .expect(400);

      expect((response.body as ApiError).error.code).toBe("SEARCH_TOO_SHORT");
    };

    it("rejects a one-character search", async () => {
      await expectTooShort("a");
    });

    it("accepts a search of exactly the minimum length (2 characters)", async () => {
      await listCustomers({ search: "ab" });
    });

    describe("edge cases", () => {
      it("rejects a search made only of spaces (trimmed to empty)", async () => {
        await expectTooShort("   ");
      });

      it("rejects an empty search term", async () => {
        await expectTooShort("");
      });
    });
  });

  describe("filter by status", () => {
    it("returns only active customers", async () => {
      const page = await listCustomers({ ...onlyOurs, active: "true" });

      expect(page.data.every(({ active }) => active)).toBe(true);
      expect(fullNamesOf(page.data)).toEqual(
        fullNamesOfKeys(["alice", "bob", "delta"]),
      );
    });

    it("returns only inactive customers", async () => {
      const page = await listCustomers({ ...onlyOurs, active: "false" });

      expect(page.data.every(({ active }) => !active)).toBe(true);
      expect(fullNamesOf(page.data)).toEqual(
        fullNamesOfKeys(["carlos", "echo"]),
      );
    });

    it("rejects a status that is not true or false", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query({ active: "maybe" })
        .expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("access", () => {
    it("rejects the request without an access token", async () => {
      await request(app.getHttpServer()).get("/api/v1/customers").expect(401);
    });

    it.each<RoleName>(ALLOWED_ROLES)(
      "allows the %s role to list customers",
      async (roleName) => {
        const page = await listCustomers(onlyOurs, tokens[roleName]);

        expect(page.data).toHaveLength(5);
      },
    );

    it("denies the list to a role that is not allowed", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${tokens[NO_ACCESS_ROLE]}`)
        .expect(403);

      expect(response.body).toMatchObject({
        error: { code: "INSUFFICIENT_PERMISSIONS" },
      });
    });
  });
});
