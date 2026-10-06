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

describe("PATCH /api/v1/branches/:id/status (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<RoleName, string>;
  const personIds = {} as Record<RoleName, string>;

  const patchStatus = (id: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/branches/${id}/status`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const createBranch = (label: string, active: boolean) =>
    prisma.branch.create({
      data: {
        name: branchName(label),
        address: "Carrera 10 # 20-30",
        phone: "6017000000",
        active,
      },
    });

  const isActive = async (id: string) =>
    (await prisma.branch.findUniqueOrThrow({ where: { id } })).active;

  const statusAuditLogs = (entityId: string) =>
    prisma.auditLog.findMany({
      where: {
        entity: "BRANCH",
        entityId,
        action: { in: ["ACTIVATE", "DEACTIVATE"] },
      },
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
          email: `${roleName.toLowerCase()}.status.${runId}@e2e.test`,
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

  describe("deactivation", () => {
    it("deactivates an active branch and records the audit log", async () => {
      const branch = await createBranch("Desactivar", true);

      const response = await patchStatus(
        branch.id,
        { active: false },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(response.body).toEqual({
        data: {
          id: branch.id,
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          active: false,
        },
      });
      expect(await isActive(branch.id)).toBe(false);

      const auditLogs = await statusAuditLogs(branch.id);
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]).toMatchObject({
        action: "DEACTIVATE",
        userId: personIds.SUPERADMIN,
        oldData: { active: true },
        newData: { active: false },
        reason: `Desactivación de la sede ${branch.name}`,
      });
    });
  });

  describe("activation", () => {
    it("activates an inactive branch and records the audit log", async () => {
      const branch = await createBranch("Activar", false);

      const response = await patchStatus(
        branch.id,
        { active: true },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(response.body).toMatchObject({
        data: { id: branch.id, active: true },
      });
      expect(await isActive(branch.id)).toBe(true);

      const auditLogs = await statusAuditLogs(branch.id);
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]).toMatchObject({
        action: "ACTIVATE",
        oldData: { active: false },
        newData: { active: true },
        reason: `Activación de la sede ${branch.name}`,
      });
    });

    it("lets the DEV role change the status", async () => {
      const branch = await createBranch("Dev", true);

      await patchStatus(branch.id, { active: false }, tokens.DEV).expect(200);

      expect(await isActive(branch.id)).toBe(false);
    });

    it("allows going back and forth between both states", async () => {
      const branch = await createBranch("Ida y vuelta", true);

      await patchStatus(branch.id, { active: false }, tokens.SUPERADMIN).expect(
        200,
      );
      await patchStatus(branch.id, { active: true }, tokens.SUPERADMIN).expect(
        200,
      );

      expect(await isActive(branch.id)).toBe(true);
      const actions = (await statusAuditLogs(branch.id)).map(
        ({ action }) => action,
      );
      expect(actions.sort()).toEqual(["ACTIVATE", "DEACTIVATE"]);
    });
  });

  describe("double transition", () => {
    it.each([
      [true, "Branch is already active"],
      [false, "Branch is already inactive"],
    ])(
      "rejects setting active=%s on a branch that already has it",
      async (active, message) => {
        const branch = await createBranch(`Ya ${String(active)}`, active);

        const response = await patchStatus(
          branch.id,
          { active },
          tokens.SUPERADMIN,
        ).expect(400);

        expect(response.body).toEqual({
          error: { code: "BAD_REQUEST", message, details: {} },
        });
        expect(await isActive(branch.id)).toBe(active);
        expect(await statusAuditLogs(branch.id)).toHaveLength(0);
      },
    );

    it("rejects repeating the same change right after it succeeded", async () => {
      const branch = await createBranch("Repetida", true);

      await patchStatus(branch.id, { active: false }, tokens.SUPERADMIN).expect(
        200,
      );
      const response = await patchStatus(
        branch.id,
        { active: false },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toMatchObject({
        error: { message: "Branch is already inactive" },
      });
      expect(await statusAuditLogs(branch.id)).toHaveLength(1);
    });

    it("applies only one of two simultaneous requests for the same change", async () => {
      const branch = await createBranch("Simultanea", true);

      const responses = await Promise.all([
        patchStatus(branch.id, { active: false }, tokens.SUPERADMIN),
        patchStatus(branch.id, { active: false }, tokens.SUPERADMIN),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
      expect(await isActive(branch.id)).toBe(false);
      expect(await statusAuditLogs(branch.id)).toHaveLength(1);
    });
  });

  describe("invalid requests", () => {
    it.each([
      ["without the active field", {}],
      ["with active as text", { active: "false" }],
      ["with active as a number", { active: 0 }],
      ["with extra fields", { active: false, name: "Otro nombre" }],
    ])("rejects a request %s", async (_case, body) => {
      const branch = await createBranch(`Invalida ${_case}`, true);

      const response = await patchStatus(
        branch.id,
        body,
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
      expect(await isActive(branch.id)).toBe(true);
    });

    it("answers 404 for a branch that does not exist", async () => {
      const response = await patchStatus(
        randomUUID(),
        { active: false },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(response.body).toEqual({
        error: { code: "NOT_FOUND", message: "Branch not found", details: {} },
      });
    });

    it("answers 400 when the id is not a valid uuid", async () => {
      await patchStatus(
        "not-a-uuid",
        { active: false },
        tokens.SUPERADMIN,
      ).expect(400);
    });
  });

  describe("access", () => {
    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "denies the status change to the %s role",
      async (roleName) => {
        const branch = await createBranch(`Denegada ${roleName}`, true);

        const response = await patchStatus(
          branch.id,
          { active: false },
          tokens[roleName],
        ).expect(403);

        expect(response.body).toMatchObject({
          error: { code: "INSUFFICIENT_PERMISSIONS" },
        });
        expect(await isActive(branch.id)).toBe(true);
        expect(await statusAuditLogs(branch.id)).toHaveLength(0);
      },
    );

    it("rejects requests without an access token", async () => {
      const branch = await createBranch("Sin token", true);

      await patchStatus(branch.id, { active: false }).expect(401);

      expect(await isActive(branch.id)).toBe(true);
    });
  });
});
