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

interface SupplierItem {
  id: string;
  person: {
    id: string;
    businessName: string | null;
    documentNumber: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    active: boolean;
    documentType: { code: string; name: string } | null;
  };
  commercialName: string | null;
}

interface SuppliersPage {
  data: SupplierItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const runId = Date.now().toString(36);
const docNumber = (suffix: string) => `900${runId}${suffix}`;

const fixtureSuppliers = [
  {
    businessName: `${runId} Suplementos Andinos SAS`,
    commercialName: `${runId} Suplementos Andinos`,
    documentNumber: docNumber("111"),
    active: true,
    order: 3,
  },
  {
    businessName: `${runId} Proteinas Vivas LTDA`,
    commercialName: `${runId} Proteinas Vivas`,
    documentNumber: docNumber("222"),
    active: true,
    order: 2,
  },
  {
    businessName: `${runId} Nutricion Total SAS`,
    commercialName: `${runId} Nutricion Total`,
    documentNumber: docNumber("333"),
    active: false,
    order: 1,
  },
];

const byCommercialName = fixtureSuppliers
  .slice()
  .sort((a, b) => a.commercialName.localeCompare(b.commercialName))
  .map(({ commercialName }) => commercialName);

describe("GET /api/v1/suppliers (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<RoleName, string>;
  const personIds: string[] = [];

  const listSuppliers = async (
    query: Record<string, string> = {},
    token: string = tokens.SUPERADMIN,
  ) => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/suppliers")
      .set("Authorization", `Bearer ${token}`)
      .query(query)
      .expect(200);
    return response.body as SuppliersPage;
  };

  const commercialNamesOf = (items: SupplierItem[]) =>
    items.map(({ commercialName }) => commercialName as string);

  const ownSuppliers = (page: SuppliersPage) =>
    page.data.filter(({ commercialName }) => commercialName?.startsWith(runId));

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
      where: { code: "NIT-E2E" },
      update: { active: true },
      create: { code: "NIT-E2E", name: "NIT (e2e)" },
    });

    for (const {
      businessName,
      commercialName,
      documentNumber,
      active,
    } of fixtureSuppliers) {
      const person = await prisma.person.create({
        data: {
          businessName,
          documentTypeId: documentType.id,
          documentNumber,
          email: `contacto.${documentNumber}@e2e.test`,
          phone: "6017000000",
          address: "Calle 1 # 2-3",
          active,
          supplier: {
            create: { commercialName },
          },
        },
      });
      personIds.push(person.id);
    }

    const roleNames: RoleName[] = [
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
      "DEV",
    ];

    for (const [index, roleName] of roleNames.entries()) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          firstName: roleName,
          lastName: "E2E",
          documentTypeId: documentType.id,
          documentNumber: docNumber(`90${index}`),
          email: `${roleName.toLowerCase()}.suppliers.${runId}@e2e.test`,
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
  }, 30000);

  afterAll(async () => {
    await prisma.supplier.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.documentType.deleteMany({ where: { code: "NIT-E2E" } });
    await app.close();
  }, 30000);

  describe("without filters", () => {
    it("returns every fixture supplier with the public fields", async () => {
      const page = await listSuppliers({ limit: "100" });

      expect(commercialNamesOf(ownSuppliers(page))).toEqual(byCommercialName);
      const fixture = page.data.find(
        ({ commercialName }) => commercialName === byCommercialName[0],
      );
      expect(fixture).toEqual({
        id: expect.any(String),
        person: {
          id: expect.any(String),
          documentTypeId: expect.any(String),
          firstName: null,
          lastName: null,
          businessName: `${runId} Nutricion Total SAS`,
          documentNumber: docNumber("333"),
          email: `contacto.${docNumber("333")}@e2e.test`,
          phone: "6017000000",
          address: "Calle 1 # 2-3",
          active: false,
          documentType: { code: "NIT-E2E", name: "NIT (e2e)" },
        },
        commercialName: `${runId} Nutricion Total`,
      });
    });

    it("reports the global count in the pagination meta", async () => {
      const page = await listSuppliers({ limit: "100" });

      expect(page.meta.total).toBe(await prisma.supplier.count());
    });

    it("applies the default pagination", async () => {
      const page = await listSuppliers();
      const total = await prisma.supplier.count();

      expect(page.meta).toEqual({
        page: 1,
        limit: 10,
        total,
        totalPages: Math.ceil(total / 10),
      });
      expect(page.data.length).toBeLessThanOrEqual(10);
    });
  });

  describe("filter by name", () => {
    it("matches part of the business name ignoring case", async () => {
      const page = await listSuppliers({
        search: `${runId} PROTEINAS`,
        limit: "100",
      });

      expect(commercialNamesOf(ownSuppliers(page))).toEqual([
        `${runId} Proteinas Vivas`,
      ]);
      expect(ownSuppliers(page)).toHaveLength(1);
    });

    it("matches part of the commercial name", async () => {
      const page = await listSuppliers({
        search: `${runId} nutricion total`,
        limit: "100",
      });

      expect(commercialNamesOf(ownSuppliers(page))).toEqual([
        `${runId} Nutricion Total`,
      ]);
    });

    it("returns an empty page when nothing matches", async () => {
      const page = await listSuppliers({
        search: `${runId} sin-coincidencias`,
      });

      expect(page.data).toEqual([]);
      expect(page.meta).toMatchObject({ total: 0, totalPages: 0 });
    });
  });

  describe("natural person suppliers", () => {
    it("returns their names and finds them by first or last name", async () => {
      const documentType = await prisma.documentType.findUniqueOrThrow({
        where: { code: "NIT-E2E" },
      });
      const person = await prisma.person.create({
        data: {
          firstName: `Marcela ${runId}`,
          lastName: `Proveedora ${runId}`,
          documentTypeId: documentType.id,
          documentNumber: docNumber("777"),
          email: `marcela.${runId}@e2e.test`,
          phone: "3001112233",
          address: "Carrera 9 # 8-7",
          supplier: {
            create: { commercialName: `Distribuciones Marcela ${runId}` },
          },
        },
      });
      personIds.push(person.id);

      const byFirstName = await listSuppliers({ search: `Marcela ${runId}` });
      const byLastName = await listSuppliers({
        search: `Proveedora ${runId}`,
      });

      expect(byFirstName.data).toEqual([
        expect.objectContaining({
          id: person.id,
          person: expect.objectContaining({
            documentTypeId: documentType.id,
            firstName: `Marcela ${runId}`,
            lastName: `Proveedora ${runId}`,
            businessName: null,
          }),
        }),
      ]);
      expect(byLastName.data.map(({ id }) => id)).toEqual([person.id]);
    });
  });

  describe("filter by NIT", () => {
    it("matches part of the document number ignoring case", async () => {
      const page = await listSuppliers({
        search: docNumber("222").toUpperCase(),
        limit: "100",
      });

      expect(commercialNamesOf(ownSuppliers(page))).toEqual([
        `${runId} Proteinas Vivas`,
      ]);
      expect(ownSuppliers(page)).toHaveLength(1);
    });

    it("returns an empty page when no document number matches", async () => {
      const page = await listSuppliers({
        search: `900${runId}999`,
      });

      expect(page.data).toEqual([]);
      expect(page.meta).toMatchObject({ total: 0, totalPages: 0 });
    });
  });

  describe("name and NIT combined", () => {
    it("answers with both sides of the OR for the same run id", async () => {
      const page = await listSuppliers({
        search: runId.toUpperCase(),
        limit: "100",
      });

      expect(commercialNamesOf(ownSuppliers(page))).toEqual(byCommercialName);
      expect(ownSuppliers(page)).toHaveLength(3);
    });

    it("narrows a name match with the active flag", async () => {
      const page = await listSuppliers({
        search: `${runId} suplementos`,
        active: "true",
        limit: "100",
      });

      expect(commercialNamesOf(ownSuppliers(page))).toEqual([
        `${runId} Suplementos Andinos`,
      ]);
    });

    it("narrows a NIT match with the active flag", async () => {
      const page = await listSuppliers({
        search: docNumber("333"),
        active: "false",
        limit: "100",
      });

      expect(commercialNamesOf(ownSuppliers(page))).toEqual([
        `${runId} Nutricion Total`,
      ]);
    });

    it("returns nothing when the name belongs to one supplier and the NIT to another", async () => {
      const page = await listSuppliers({
        search: `proteinas ${docNumber("111")}`,
      });

      expect(page.data).toEqual([]);
    });
  });

  describe("filter by status", () => {
    it("returns only fixtures whose person is active", async () => {
      const page = await listSuppliers({ active: "true", limit: "100" });

      expect(ownSuppliers(page).every(({ person }) => person.active)).toBe(
        true,
      );
      expect(commercialNamesOf(ownSuppliers(page))).toEqual(
        expect.arrayContaining([
          `${runId} Suplementos Andinos`,
          `${runId} Proteinas Vivas`,
        ]),
      );
      expect(commercialNamesOf(ownSuppliers(page))).not.toContain(
        `${runId} Nutricion Total`,
      );
    });

    it("returns only fixtures whose person is inactive", async () => {
      const page = await listSuppliers({ active: "false", limit: "100" });

      expect(ownSuppliers(page).every(({ person }) => !person.active)).toBe(
        true,
      );
      expect(commercialNamesOf(ownSuppliers(page))).toEqual(
        expect.arrayContaining([`${runId} Nutricion Total`]),
      );
      expect(commercialNamesOf(ownSuppliers(page))).not.toContain(
        `${runId} Suplementos Andinos`,
      );
    });

    it("rejects a status that is not true or false", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/suppliers")
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .query({ active: "maybe" })
        .expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("access", () => {
    it("rejects requests without an access token", async () => {
      await request(app.getHttpServer()).get("/api/v1/suppliers").expect(401);
    });

    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER", "DEV"])(
      "allows the %s role to list suppliers",
      async (roleName) => {
        const page = await listSuppliers(
          { search: runId, limit: "100" },
          tokens[roleName],
        );

        expect(ownSuppliers(page)).toHaveLength(3);
      },
    );

    it("denies the listing to the BRANCH_ASSISTANT role", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/suppliers")
        .set("Authorization", `Bearer ${tokens.BRANCH_ASSISTANT}`)
        .expect(403);

      expect(response.body).toMatchObject({
        error: { code: "INSUFFICIENT_PERMISSIONS" },
      });
    });
  });
});
