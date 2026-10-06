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

interface AssignmentItem {
  id: string;
  name: string;
  assignmentDate: string;
  endDate: string | null;
  active: boolean;
}

const runId = Date.now().toString(36);
const branchName = (label: string) => `${runId} ${label}`;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("User branch assignment endpoints (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let roleIds = {} as Record<RoleName, string>;
  const tokens = {} as Record<RoleName, string>;
  const operatorIds: string[] = [];
  const employeeIds: string[] = [];

  const withToken = (
    pending: request.Test,
    token: string | undefined,
  ): request.Test =>
    token ? pending.set("Authorization", `Bearer ${token}`) : pending;

  const assignBranch = (userId: string, branchId: unknown, token?: string) =>
    withToken(
      request(app.getHttpServer()).post(`/api/v1/users/${userId}/branches`),
      token,
    ).send({ branchId });

  const listAssignments = (userId: string, token?: string) =>
    withToken(
      request(app.getHttpServer()).get(`/api/v1/users/${userId}/branches`),
      token,
    );

  const deactivateAssignment = (
    userId: string,
    branchId: string,
    token?: string,
  ) =>
    withToken(
      request(app.getHttpServer()).patch(
        `/api/v1/users/${userId}/branches/${branchId}`,
      ),
      token,
    ).send({ active: false });

  const createEmployee = async (label: string) => {
    const person = await prisma.person.create({
      data: {
        firstName: label,
        lastName: "E2E",
        email: `${label.toLowerCase()}.employee.${runId}@e2e.test`,
        userAccount: {
          create: { roleId: roleIds.BRANCH_ASSISTANT, active: true },
        },
      },
    });
    employeeIds.push(person.id);
    return person.id;
  };

  const createBranch = (label: string, active = true) =>
    prisma.branch.create({
      data: {
        name: branchName(label),
        address: "Carrera 10 # 20-30",
        phone: "6017000000",
        active,
      },
    });

  const assignmentRows = (userId: string, branchId: string) =>
    prisma.userBranch.findMany({ where: { userId, branchId } });

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
      roleIds = { ...roleIds, [roleName]: role.id };
      const person = await prisma.person.create({
        data: {
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.assign.${runId}@e2e.test`,
          userAccount: {
            create: {
              roleId: role.id,
              active: true,
              mustChangePassword: false,
            },
          },
        },
      });
      operatorIds.push(person.id);
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }
  });

  afterAll(async () => {
    const personIds = [...operatorIds, ...employeeIds];
    await prisma.auditLog.deleteMany({
      where: { userId: { in: operatorIds } },
    });
    await prisma.userBranch.deleteMany({
      where: { userId: { in: personIds } },
    });
    await prisma.branch.deleteMany({ where: { name: { startsWith: runId } } });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await app.close();
  });

  describe("successful assignment", () => {
    it("assigns an active branch and records the audit log", async () => {
      const userId = await createEmployee("Asignada");
      const branch = await createBranch("Centro");

      const response = await assignBranch(
        userId,
        branch.id,
        tokens.SUPERADMIN,
      ).expect(201);

      expect(response.body).toEqual({
        data: {
          id: expect.any(String),
          userId,
          branchId: branch.id,
          assignmentDate: `${todayUtc()}T00:00:00.000Z`,
          endDate: null,
          active: true,
        },
      });

      const auditLog = await prisma.auditLog.findFirst({
        where: { entity: "USER", entityId: userId, action: "ASSIGN" },
      });
      expect(auditLog).toMatchObject({
        userId: operatorIds[0],
        newData: expect.objectContaining({
          branchId: branch.id,
          branchName: branch.name,
        }),
      });
    });

    it("lists the assigned branch when querying the user", async () => {
      const userId = await createEmployee("Consultada");
      const branch = await createBranch("Norte");
      await assignBranch(userId, branch.id, tokens.SUPERADMIN).expect(201);

      const response = await listAssignments(userId, tokens.SUPERADMIN).expect(
        200,
      );

      expect(response.body).toEqual({
        data: [
          {
            id: branch.id,
            name: branch.name,
            assignmentDate: todayUtc(),
            endDate: null,
            active: true,
          },
        ],
      });
    });

    it("keeps every branch when the user works in several of them", async () => {
      const userId = await createEmployee("Varias");
      const first = await createBranch("Varias Uno");
      const second = await createBranch("Varias Dos");

      await assignBranch(userId, first.id, tokens.SUPERADMIN).expect(201);
      await assignBranch(userId, second.id, tokens.DEV).expect(201);

      const response = await listAssignments(userId, tokens.DEV).expect(200);
      const names = (response.body as { data: AssignmentItem[] }).data
        .map(({ name }) => name)
        .sort();
      expect(names).toEqual([first.name, second.name].sort());
    });

    it("returns an empty list for a user without branches", async () => {
      const userId = await createEmployee("Sinsedes");

      const response = await listAssignments(userId, tokens.SUPERADMIN).expect(
        200,
      );

      expect(response.body).toEqual({ data: [] });
    });
  });

  describe("replacement of a previous assignment", () => {
    it("reactivates the same assignment when it was deactivated today", async () => {
      const userId = await createEmployee("Reactivada");
      const branch = await createBranch("Reactivada");
      const first = await assignBranch(
        userId,
        branch.id,
        tokens.SUPERADMIN,
      ).expect(201);
      await deactivateAssignment(userId, branch.id, tokens.SUPERADMIN).expect(
        200,
      );

      const second = await assignBranch(
        userId,
        branch.id,
        tokens.SUPERADMIN,
      ).expect(201);

      const firstId = (first.body as { data: { id: string } }).data.id;
      expect(second.body).toMatchObject({
        data: { id: firstId, active: true, endDate: null },
      });
      const rows = await assignmentRows(userId, branch.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ active: true, endDate: null });
    });

    it("creates a new assignment and keeps the history when the previous one is from another day", async () => {
      const userId = await createEmployee("Historial");
      const branch = await createBranch("Historial");
      await prisma.userBranch.create({
        data: {
          userId,
          branchId: branch.id,
          assignmentDate: new Date("2026-01-15T00:00:00.000Z"),
          endDate: new Date("2026-03-01T00:00:00.000Z"),
          active: false,
        },
      });

      await assignBranch(userId, branch.id, tokens.SUPERADMIN).expect(201);

      const response = await listAssignments(userId, tokens.SUPERADMIN).expect(
        200,
      );
      expect((response.body as { data: AssignmentItem[] }).data).toEqual([
        {
          id: branch.id,
          name: branch.name,
          assignmentDate: todayUtc(),
          endDate: null,
          active: true,
        },
        {
          id: branch.id,
          name: branch.name,
          assignmentDate: "2026-01-15",
          endDate: "2026-03-01",
          active: false,
        },
      ]);
    });

    it("moves the user to another branch after deactivating the previous one", async () => {
      const userId = await createEmployee("Traslado");
      const previous = await createBranch("Traslado Origen");
      const next = await createBranch("Traslado Destino");
      await assignBranch(userId, previous.id, tokens.SUPERADMIN).expect(201);

      await deactivateAssignment(userId, previous.id, tokens.SUPERADMIN).expect(
        200,
      );
      await assignBranch(userId, next.id, tokens.SUPERADMIN).expect(201);

      const response = await listAssignments(userId, tokens.SUPERADMIN).expect(
        200,
      );
      const assignments = (response.body as { data: AssignmentItem[] }).data;
      expect(assignments.find(({ id }) => id === next.id)).toMatchObject({
        active: true,
        endDate: null,
      });
      expect(assignments.find(({ id }) => id === previous.id)).toMatchObject({
        active: false,
        endDate: todayUtc(),
      });
    });

    it("rejects assigning a branch that the user already has active", async () => {
      const userId = await createEmployee("Duplicada");
      const branch = await createBranch("Duplicada");
      await assignBranch(userId, branch.id, tokens.SUPERADMIN).expect(201);

      const response = await assignBranch(
        userId,
        branch.id,
        tokens.SUPERADMIN,
      ).expect(409);

      expect(response.body).toMatchObject({
        error: {
          code: "CONFLICT",
          message: "User is already assigned to this branch",
        },
      });
      expect(await assignmentRows(userId, branch.id)).toHaveLength(1);
    });
  });

  describe("inactive branch", () => {
    it("rejects assigning an inactive branch without creating the assignment", async () => {
      const userId = await createEmployee("Inactiva");
      const branch = await createBranch("Inactiva", false);

      const response = await assignBranch(
        userId,
        branch.id,
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toEqual({
        error: {
          code: "BAD_REQUEST",
          message: "Cannot assign an inactive branch",
          details: {},
        },
      });
      expect(await assignmentRows(userId, branch.id)).toHaveLength(0);
      const auditLog = await prisma.auditLog.findFirst({
        where: { entity: "USER", entityId: userId, action: "ASSIGN" },
      });
      expect(auditLog).toBeNull();
    });

    it("rejects reactivating an assignment once the branch became inactive", async () => {
      const userId = await createEmployee("Cerrada");
      const branch = await createBranch("Cerrada");
      await assignBranch(userId, branch.id, tokens.SUPERADMIN).expect(201);
      await deactivateAssignment(userId, branch.id, tokens.SUPERADMIN).expect(
        200,
      );
      await prisma.branch.update({
        where: { id: branch.id },
        data: { active: false },
      });

      await assignBranch(userId, branch.id, tokens.SUPERADMIN).expect(400);

      const rows = await assignmentRows(userId, branch.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ active: false });
    });
  });

  describe("invalid requests", () => {
    it("answers 404 when the branch does not exist", async () => {
      const userId = await createEmployee("Sinsede");

      const response = await assignBranch(
        userId,
        randomUUID(),
        tokens.SUPERADMIN,
      ).expect(404);

      expect(response.body).toMatchObject({
        error: { code: "NOT_FOUND", message: "Branch not found" },
      });
    });

    it("answers 404 when the user does not exist", async () => {
      const branch = await createBranch("Sin usuario");

      const response = await assignBranch(
        randomUUID(),
        branch.id,
        tokens.SUPERADMIN,
      ).expect(404);

      expect(response.body).toMatchObject({
        error: { code: "NOT_FOUND", message: "User not found" },
      });
    });

    it("answers 404 when querying a user that does not exist", async () => {
      await listAssignments(randomUUID(), tokens.SUPERADMIN).expect(404);
    });

    it.each([
      ["is not a uuid", "sede-centro"],
      ["is missing", undefined],
    ])("answers 400 when the branch id %s", async (_case, branchId) => {
      const userId = await createEmployee(
        `Invalida${_case.replace(/\W/g, "")}`,
      );

      await assignBranch(userId, branchId, tokens.SUPERADMIN).expect(400);
    });
  });

  describe("access", () => {
    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "denies the assignment to the %s role",
      async (roleName) => {
        const userId = await createEmployee(`Denegada${roleName}`);
        const branch = await createBranch(`Denegada ${roleName}`);

        const response = await assignBranch(
          userId,
          branch.id,
          tokens[roleName],
        ).expect(403);

        expect(response.body).toMatchObject({
          error: { code: "INSUFFICIENT_PERMISSIONS" },
        });
        expect(await assignmentRows(userId, branch.id)).toHaveLength(0);
      },
    );

    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "denies the query to the %s role",
      async (roleName) => {
        const userId = await createEmployee(`Consulta${roleName}`);

        await listAssignments(userId, tokens[roleName]).expect(403);
      },
    );

    it("rejects requests without an access token", async () => {
      const userId = await createEmployee("Sintoken");
      const branch = await createBranch("Sin token");

      await assignBranch(userId, branch.id).expect(401);
      await listAssignments(userId).expect(401);
    });
  });
});
