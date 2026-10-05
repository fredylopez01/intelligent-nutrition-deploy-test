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

const runId = Date.now().toString(36);
const branchName = (label: string) => `E2E ${label} ${runId}`;

describe("POST /api/v1/branches (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<RoleName, string>;
  const personIds: string[] = [];

  const postBranch = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/branches");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const countBranchesNamed = (name: string) =>
    prisma.branch.count({ where: { name } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
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
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.${runId}@e2e.test`,
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
  });

  afterAll(async () => {
    const createdBranches = await prisma.branch.findMany({
      where: { name: { endsWith: runId } },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({ where: { userId: { in: personIds } } });
    await prisma.branch.deleteMany({
      where: { id: { in: createdBranches.map(({ id }) => id) } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await app.close();
  });

  it("creates the branch for a Superadmin and records the audit log", async () => {
    const name = branchName("Centro");

    const response = await postBranch(
      { name, address: "Carrera 10 # 20-30", phone: "6017000000" },
      tokens.SUPERADMIN,
    ).expect(201);

    expect(response.body).toEqual({
      data: {
        id: expect.any(String),
        name,
        address: "Carrera 10 # 20-30",
        phone: "6017000000",
        active: true,
      },
    });

    const body = response.body as { data: { id: string } };
    const stored = await prisma.branch.findUnique({
      where: { id: body.data.id },
    });
    expect(stored).toMatchObject({ name, active: true });

    const auditLog = await prisma.auditLog.findFirst({
      where: { entity: "BRANCH", entityId: body.data.id },
    });
    expect(auditLog).toMatchObject({
      action: "CREATE",
      userId: personIds[0],
    });
  });

  it("trims the submitted values before saving them", async () => {
    const name = branchName("Norte");

    const response = await postBranch(
      {
        name: `  ${name}  `,
        address: "  Calle 5 # 1-2 ",
        phone: " 6017000001 ",
      },
      tokens.SUPERADMIN,
    ).expect(201);

    expect(response.body).toMatchObject({
      data: { name, address: "Calle 5 # 1-2", phone: "6017000001" },
    });
  });

  it.each([
    ["name", { address: "Calle 1 # 2-3", phone: "6017000002" }],
    ["address", { name: branchName("Sin direccion"), phone: "6017000002" }],
    ["phone", { name: branchName("Sin telefono"), address: "Calle 1 # 2-3" }],
  ])("rejects the request when %s is missing", async (field, body) => {
    const response = await postBranch(body, tokens.SUPERADMIN).expect(400);

    expect(response.body).toMatchObject({
      error: { code: "BAD_REQUEST", message: "Request validation failed." },
    });
    const details = (response.body as { error: { details: string[] } }).error
      .details;
    expect(details.some((detail) => detail.startsWith(field))).toBe(true);

    if ("name" in body) {
      expect(await countBranchesNamed(body.name)).toBe(0);
    }
  });

  it("rejects blank values that only contain spaces", async () => {
    const response = await postBranch(
      { name: "   ", address: "   ", phone: "   " },
      tokens.SUPERADMIN,
    ).expect(400);

    expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
  });

  it("rejects a duplicated branch name", async () => {
    const name = branchName("Duplicada");
    await prisma.branch.create({
      data: { name, address: "Calle 9 # 9-9", phone: "6017000003" },
    });

    const response = await postBranch(
      { name, address: "Otra direccion", phone: "6017000004" },
      tokens.SUPERADMIN,
    ).expect(409);

    expect(response.body).toEqual({
      error: {
        code: "CONFLICT",
        message: "Branch name already exists",
        details: {},
      },
    });
    expect(await countBranchesNamed(name)).toBe(1);
  });

  it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
    "denies access to the %s role",
    async (roleName) => {
      const name = branchName(`Denegada ${roleName}`);

      const response = await postBranch(
        { name, address: "Calle 1 # 2-3", phone: "6017000005" },
        tokens[roleName],
      ).expect(403);

      expect(response.body).toMatchObject({
        error: { code: "INSUFFICIENT_PERMISSIONS" },
      });
      expect(await countBranchesNamed(name)).toBe(0);
    },
  );

  it("rejects requests without an access token", async () => {
    const name = branchName("Sin token");

    await postBranch({
      name,
      address: "Calle 1 # 2-3",
      phone: "6017000006",
    }).expect(401);

    expect(await countBranchesNamed(name)).toBe(0);
  });
});
