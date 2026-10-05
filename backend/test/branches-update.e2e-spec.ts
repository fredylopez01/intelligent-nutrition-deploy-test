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

const runId = Date.now().toString(36);
const branchName = (label: string) => `${runId} ${label}`;

const originalData = {
  address: "Carrera 10 # 20-30",
  phone: "6017000000",
};

describe("PATCH /api/v1/branches/:id (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<RoleName, string>;
  const personIds = {} as Record<RoleName, string>;

  const patchBranch = (id: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/branches/${id}`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const createBranch = (label: string) =>
    prisma.branch.create({
      data: { name: branchName(label), ...originalData },
    });

  const findBranch = (id: string) =>
    prisma.branch.findUnique({
      where: { id },
      select: { name: true, address: true, phone: true, active: true },
    });

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
          email: `${roleName.toLowerCase()}.update.${runId}@e2e.test`,
          userAccount: {
            create: {
              roleId: role.id,
              active: true,
              mustChangePassword: false,
            },
          },
        },
      });
      personIds[roleName] = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }
  });

  afterAll(async () => {
    const userIds = Object.values(personIds);
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.branch.deleteMany({ where: { name: { startsWith: runId } } });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: userIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe("successful update", () => {
    it("updates every field for a Superadmin and records the audit log", async () => {
      const branch = await createBranch("Centro");

      const response = await patchBranch(
        branch.id,
        {
          name: branchName("Centro Renovada"),
          address: "Calle 50 # 10-20",
          phone: "6017111111",
        },
        tokens.SUPERADMIN,
      ).expect(200);

      const expected = {
        name: branchName("Centro Renovada"),
        address: "Calle 50 # 10-20",
        phone: "6017111111",
        active: true,
      };
      expect(response.body).toEqual({ data: { id: branch.id, ...expected } });
      expect(await findBranch(branch.id)).toEqual(expected);

      const auditLog = await prisma.auditLog.findFirst({
        where: { entity: "BRANCH", entityId: branch.id, action: "UPDATE" },
      });
      expect(auditLog).toMatchObject({
        userId: personIds.SUPERADMIN,
        oldData: expect.objectContaining({ name: branchName("Centro") }),
        newData: expect.objectContaining({
          name: branchName("Centro Renovada"),
        }),
      });
    });

    it("changes only the fields that are sent", async () => {
      const branch = await createBranch("Parcial");

      await patchBranch(
        branch.id,
        { phone: "6017222222" },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(await findBranch(branch.id)).toEqual({
        name: branchName("Parcial"),
        address: originalData.address,
        phone: "6017222222",
        active: true,
      });
    });

    it("trims the submitted values before saving them", async () => {
      const branch = await createBranch("Espacios");

      const response = await patchBranch(
        branch.id,
        { address: "  Calle 8 # 1-1  ", phone: " 6017333333 " },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(response.body).toMatchObject({
        data: { address: "Calle 8 # 1-1", phone: "6017333333" },
      });
    });

    it("lets the DEV role update a branch", async () => {
      const branch = await createBranch("Dev");

      await patchBranch(
        branch.id,
        { address: "Avenida 1 # 2-3" },
        tokens.DEV,
      ).expect(200);

      expect(await findBranch(branch.id)).toMatchObject({
        address: "Avenida 1 # 2-3",
      });
    });
  });

  describe("invalid address or phone", () => {
    it.each([
      ["contains letters", "60170abc"],
      ["contains symbols", "601-700-0000"],
      ["has spaces in the middle", "601 700 0000"],
      ["is longer than 30 digits", "1".repeat(31)],
      ["is empty", ""],
      ["only has spaces", "   "],
    ])("rejects a phone that %s", async (_case, phone) => {
      const branch = await createBranch(`Telefono ${phone.length}${_case}`);

      const response = await patchBranch(
        branch.id,
        { phone },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toMatchObject({
        error: { code: "BAD_REQUEST", message: "Request validation failed." },
      });
      expect(await findBranch(branch.id)).toMatchObject({
        phone: originalData.phone,
      });
    });

    it.each([
      ["is empty", ""],
      ["only has spaces", "   "],
      ["is longer than 255 characters", "a".repeat(256)],
      ["is not text", 12345],
    ])("rejects an address that %s", async (_case, address) => {
      const branch = await createBranch(`Direccion ${_case}`);

      const response = await patchBranch(
        branch.id,
        { address },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
      expect(await findBranch(branch.id)).toMatchObject({
        address: originalData.address,
      });
    });

    it("rejects a request without fields to update", async () => {
      const branch = await createBranch("Sin campos");

      const response = await patchBranch(
        branch.id,
        {},
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "BAD_REQUEST",
          message: "At least one field must be provided",
        },
      });
    });

    it("rejects fields that are not part of the branch", async () => {
      const branch = await createBranch("Campo extra");

      await patchBranch(branch.id, { active: false }, tokens.SUPERADMIN).expect(
        400,
      );

      expect(await findBranch(branch.id)).toMatchObject({ active: true });
    });
  });

  describe("missing or conflicting branch", () => {
    it("answers 404 for a branch that does not exist", async () => {
      const response = await patchBranch(
        randomUUID(),
        { phone: "6017444444" },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(response.body).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Branch not found",
          details: {},
        },
      });
    });

    it("answers 400 when the id is not a valid uuid", async () => {
      await patchBranch(
        "not-a-uuid",
        { phone: "6017444444" },
        tokens.SUPERADMIN,
      ).expect(400);
    });

    it("rejects a name that already belongs to another branch", async () => {
      const taken = await createBranch("Ocupada");
      const branch = await createBranch("Libre");

      const response = await patchBranch(
        branch.id,
        { name: taken.name },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(response.body).toMatchObject({
        error: { code: "CONFLICT", message: "Branch name already exists" },
      });
      expect(await findBranch(branch.id)).toMatchObject({
        name: branchName("Libre"),
      });
    });
  });

  describe("access", () => {
    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "denies the update to the %s role",
      async (roleName) => {
        const branch = await createBranch(`Denegada ${roleName}`);

        const response = await patchBranch(
          branch.id,
          { phone: "6017555555" },
          tokens[roleName],
        ).expect(403);

        expect(response.body).toMatchObject({
          error: { code: "INSUFFICIENT_PERMISSIONS" },
        });
        expect(await findBranch(branch.id)).toMatchObject({
          phone: originalData.phone,
        });
      },
    );

    it("rejects requests without an access token", async () => {
      const branch = await createBranch("Sin token");

      await patchBranch(branch.id, { phone: "6017666666" }).expect(401);

      expect(await findBranch(branch.id)).toMatchObject({
        phone: originalData.phone,
      });
    });
  });
});
