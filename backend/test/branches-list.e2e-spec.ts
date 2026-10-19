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

interface BranchItem {
  id: string;
  name: string;
  address: string;
  phone: string;
  active: boolean;
}

interface BranchesPage {
  data: BranchItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = "CC-BRLST-E2E";
let documentTypeId: string;
let documentSequence = 0;
const nextDocumentNumber = () => `${runId}${(documentSequence += 1)}`;
const fixtureBranches = [
  { name: `${runId} Centro Norte`, active: true },
  { name: `${runId} Centro Sur`, active: false },
  { name: `${runId} Plaza Mayor`, active: true },
  { name: `${runId} Plaza Vieja`, active: false },
];

describe("GET /api/v1/branches (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<RoleName, string>;
  const personIds: string[] = [];

  const listBranches = async (
    query: Record<string, string> = {},
    token?: string,
  ) => {
    const pending = request(app.getHttpServer())
      .get("/api/v1/branches")
      .query(query);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    const response = await pending.expect(200);
    return response.body as BranchesPage;
  };

  const namesOf = (page: BranchesPage) => page.data.map(({ name }) => name);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    documentTypeId = (
      await prisma.documentType.upsert({
        where: { code: DOCUMENT_CODE },
        update: { active: true },
        create: { code: DOCUMENT_CODE, name: "Documento (e2e)" },
      })
    ).id;
    const jwtService = app.get(JwtService);
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
          documentNumber: nextDocumentNumber(),
          phone: "3000000000",
          address: "Calle 1 # 2-3",
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.list.${runId}@e2e.test`,
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

    await prisma.branch.createMany({
      data: fixtureBranches.map(({ name, active }) => ({
        name,
        active,
        address: "Calle 1 # 2-3",
        phone: "6017000000",
      })),
    });
  });

  afterAll(async () => {
    await prisma.branch.deleteMany({ where: { name: { startsWith: runId } } });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.documentType.deleteMany({
      where: { code: DOCUMENT_CODE },
    });
    await app.close();
  });

  describe("without filters", () => {
    it("returns every branch ordered by name with the public fields", async () => {
      const page = await listBranches({ limit: "100" });

      const ownNames = namesOf(page).filter((name) => name.startsWith(runId));
      expect(ownNames).toEqual(fixtureBranches.map(({ name }) => name));
      expect(page.data[0]).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        address: expect.any(String),
        phone: expect.any(String),
        active: expect.any(Boolean),
      });
      expect(page.meta.total).toBe(await prisma.branch.count());
    });

    it("applies the default pagination", async () => {
      const page = await listBranches();
      const total = await prisma.branch.count();

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
    it("matches part of the name ignoring case", async () => {
      const page = await listBranches({ search: `${runId} CENTRO` });

      expect(namesOf(page)).toEqual([
        `${runId} Centro Norte`,
        `${runId} Centro Sur`,
      ]);
      expect(page.meta.total).toBe(2);
    });

    it("returns an empty page when nothing matches", async () => {
      const page = await listBranches({ search: `${runId} sin coincidencias` });

      expect(page.data).toEqual([]);
      expect(page.meta).toMatchObject({ total: 0, totalPages: 0 });
    });
  });

  describe("filter by status", () => {
    it("returns only active branches", async () => {
      const page = await listBranches({ active: "true", limit: "100" });

      expect(page.data.every(({ active }) => active)).toBe(true);
      expect(namesOf(page)).toEqual(
        expect.arrayContaining([
          `${runId} Centro Norte`,
          `${runId} Plaza Mayor`,
        ]),
      );
      expect(namesOf(page)).not.toContain(`${runId} Centro Sur`);
    });

    it("returns only inactive branches", async () => {
      const page = await listBranches({ active: "false", limit: "100" });

      expect(page.data.every(({ active }) => !active)).toBe(true);
      expect(namesOf(page)).toEqual(
        expect.arrayContaining([`${runId} Centro Sur`, `${runId} Plaza Vieja`]),
      );
      expect(namesOf(page)).not.toContain(`${runId} Plaza Mayor`);
    });

    it("rejects a status that is not true or false", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/branches")
        .query({ active: "maybe" })
        .expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("name and status combined", () => {
    it("returns the branches that match both filters", async () => {
      const page = await listBranches({
        search: `${runId} plaza`,
        active: "true",
      });

      expect(namesOf(page)).toEqual([`${runId} Plaza Mayor`]);
      expect(page.meta.total).toBe(1);
    });

    it("returns the inactive branches that match the name", async () => {
      const page = await listBranches({
        search: `${runId} centro`,
        active: "false",
      });

      expect(namesOf(page)).toEqual([`${runId} Centro Sur`]);
    });
  });

  describe("access", () => {
    it("answers without an access token because the listing is public", async () => {
      const page = await listBranches({ search: runId });

      expect(page.meta.total).toBe(fixtureBranches.length);
    });

    it.each<RoleName>([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
      "DEV",
    ])("does not deny the listing to the %s role", async (roleName) => {
      const page = await listBranches({ search: runId }, tokens[roleName]);

      expect(page.meta.total).toBe(fixtureBranches.length);
    });
  });
});
