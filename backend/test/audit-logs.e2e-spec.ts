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

type RoleName = "SUPERADMIN" | "DEV" | "BRANCH_LEADER" | "BRANCH_ASSISTANT";

const runId = Date.now().toString(36);
const reasonFor = (label: string) => `${runId} ${label}`;

interface AuditLogItem {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  oldData: unknown;
  newData: unknown;
  reason: string;
  ipAddress: string | null;
  createdAt: string;
  userAccount: {
    person: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  } | null;
}

interface ListResponse {
  data: { data: AuditLogItem[]; meta: Record<string, number> };
}

describe("GET /api/v1/audit-logs (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<RoleName, string>;
  const personIds = {} as Record<RoleName, string>;

  let affectedUserA = "";
  let affectedUserB = "";

  const listLogs = (query = "", token?: string) => {
    const pending = request(app.getHttpServer()).get(
      `/api/v1/audit-logs${query}`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const items = (body: ListResponse) => body.data.data;

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
      "DEV",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
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
          email: `${roleName.toLowerCase()}.audit.${runId}@e2e.test`,
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

    const affectedA = await prisma.person.create({
      data: {
        firstName: "Afectado",
        lastName: "A",
        email: `afectado.a.${runId}@e2e.test`,
      },
    });
    const affectedB = await prisma.person.create({
      data: {
        firstName: "Afectado",
        lastName: "B",
        email: `afectado.b.${runId}@e2e.test`,
      },
    });
    affectedUserA = affectedA.id;
    affectedUserB = affectedB.id;

    await prisma.auditLog.create({
      data: {
        userId: personIds.SUPERADMIN,
        action: "UPDATE",
        entity: "USER",
        entityId: affectedUserA,
        oldData: { phone: "3000000001" },
        newData: { phone: "3000000002" },
        reason: reasonFor("update affected user A"),
        createdAt: new Date("2026-01-10T10:00:00.000Z"),
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: personIds.SUPERADMIN,
        action: "CREATE",
        entity: "USER",
        entityId: affectedUserA,
        newData: { firstName: "Afectado" },
        reason: reasonFor("create affected user A"),
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: personIds.SUPERADMIN,
        action: "CREATE",
        entity: "BRANCH",
        entityId: randomUUID(),
        reason: reasonFor("create branch"),
        createdAt: new Date("2026-01-20T10:00:00.000Z"),
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: personIds.DEV,
        action: "DELETE",
        entity: "USER",
        entityId: affectedUserB,
        reason: reasonFor("delete affected user B"),
        createdAt: new Date("2026-03-05T10:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    const userIds = Object.values(personIds);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { reason: { startsWith: runId } }],
      },
    });
    await prisma.person.deleteMany({
      where: { id: { in: [affectedUserA, affectedUserB] } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: userIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe("successful query", () => {
    it("returns the log list with pagination meta for a Superadmin", async () => {
      const response = await listLogs("", tokens.SUPERADMIN).expect(200);

      const body = response.body as ListResponse;
      expect(body.data.meta).toEqual({
        page: 1,
        limit: 10,
        total: 4,
        totalPages: 1,
      });
      expect(items(body)).toHaveLength(4);
    });

    it("includes the executor person data for each log", async () => {
      const response = await listLogs(
        "?action=UPDATE",
        tokens.SUPERADMIN,
      ).expect(200);

      const log = items(response.body as ListResponse)[0];
      expect(log).toMatchObject({
        action: "UPDATE",
        entity: "USER",
        entityId: affectedUserA,
        reason: reasonFor("update affected user A"),
        oldData: { phone: "3000000001" },
        newData: { phone: "3000000002" },
        ipAddress: null,
        userAccount: {
          person: {
            firstName: "SUPERADMIN",
            lastName: "E2E",
            email: `superadmin.audit.${runId}@e2e.test`,
          },
        },
      });
      expect(typeof log.id).toBe("string");
      expect(log.createdAt).toBe("2026-01-10T10:00:00.000Z");
    });

    it("orders the logs from newest to oldest", async () => {
      const response = await listLogs("?page=1&limit=2", tokens.SUPERADMIN);

      const page1 = items(response.body as ListResponse);
      expect(page1.map((log) => log.action)).toEqual(["DELETE", "CREATE"]);
      expect(page1.map((log) => log.createdAt)).toEqual([
        "2026-03-05T10:00:00.000Z",
        "2026-02-15T10:00:00.000Z",
      ]);

      const secondPage = await listLogs(
        "?page=2&limit=2",
        tokens.SUPERADMIN,
      ).expect(200);
      const page2 = items(secondPage.body as ListResponse);
      expect(page2.map((log) => log.createdAt)).toEqual([
        "2026-01-20T10:00:00.000Z",
        "2026-01-10T10:00:00.000Z",
      ]);
      expect((secondPage.body as ListResponse).data.meta).toEqual({
        page: 2,
        limit: 2,
        total: 4,
        totalPages: 2,
      });
    });

    it("returns an empty list when nothing matches", async () => {
      const response = await listLogs(
        "?action=LOGIN",
        tokens.SUPERADMIN,
      ).expect(200);

      const body = response.body as ListResponse;
      expect(items(body)).toEqual([]);
      expect(body.data.meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it("allows the DEV role to query the audit history", async () => {
      await listLogs("", tokens.DEV).expect(200);
    });
  });

  describe("filters", () => {
    it("filters by action", async () => {
      const response = await listLogs(
        "?action=DELETE",
        tokens.SUPERADMIN,
      ).expect(200);

      const found = items(response.body as ListResponse);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        action: "DELETE",
        entityId: affectedUserB,
      });
    });

    it("filters by affected user and ignores logs of other entities", async () => {
      const response = await listLogs(
        `?userId=${affectedUserA}`,
        tokens.SUPERADMIN,
      ).expect(200);

      const found = items(response.body as ListResponse);
      expect(found).toHaveLength(2);
      expect(found.map((log) => log.action).sort()).toEqual([
        "CREATE",
        "UPDATE",
      ]);
      expect(found.every((log) => log.entity === "USER")).toBe(true);
      expect(found.every((log) => log.entityId === affectedUserA)).toBe(true);
      expect(
        found.some((log) => log.reason === reasonFor("create branch")),
      ).toBe(false);
    });

    it("filters by the lower bound of the date range", async () => {
      const response = await listLogs(
        "?fromDate=2026-02-01",
        tokens.SUPERADMIN,
      ).expect(200);

      const found = items(response.body as ListResponse);
      expect(found.map((log) => log.createdAt)).toEqual([
        "2026-03-05T10:00:00.000Z",
        "2026-02-15T10:00:00.000Z",
      ]);
    });

    it("includes the whole final day when toDate only has the date", async () => {
      const response = await listLogs(
        "?toDate=2026-01-31",
        tokens.SUPERADMIN,
      ).expect(200);

      const found = items(response.body as ListResponse);
      expect(found.map((log) => log.createdAt)).toEqual([
        "2026-01-20T10:00:00.000Z",
        "2026-01-10T10:00:00.000Z",
      ]);
    });

    it("filters by a closed date range", async () => {
      const response = await listLogs(
        "?fromDate=2026-01-15&toDate=2026-02-28",
        tokens.SUPERADMIN,
      ).expect(200);

      const found = items(response.body as ListResponse);
      expect(found.map((log) => log.createdAt)).toEqual([
        "2026-02-15T10:00:00.000Z",
        "2026-01-20T10:00:00.000Z",
      ]);
    });

    it("rejects a range whose fromDate is after the toDate", async () => {
      const response = await listLogs(
        "?fromDate=2026-03-01&toDate=2026-02-01",
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "BAD_REQUEST",
          message: "fromDate must be before or equal to toDate",
        },
      });
    });
  });

  describe("query validation", () => {
    it("rejects a userId that is not a valid uuid", async () => {
      const response = await listLogs(
        "?userId=not-a-uuid",
        tokens.SUPERADMIN,
      ).expect(400);

      expect(response.body).toMatchObject({
        error: { code: "BAD_REQUEST", message: "Request validation failed." },
      });
    });

    it("rejects a fromDate that is not a valid ISO date", async () => {
      await listLogs("?fromDate=not-a-date", tokens.SUPERADMIN).expect(400);
    });

    it.each([
      ["limit below the minimum", "?limit=0"],
      ["limit above the maximum", "?limit=101"],
      ["a page below the minimum", "?page=0"],
    ])("rejects %s", async (_case, query) => {
      await listLogs(query, tokens.SUPERADMIN).expect(400);
    });

    it("rejects query parameters that are not part of the contract", async () => {
      await listLogs("?entity=USER", tokens.SUPERADMIN).expect(400);
    });
  });

  describe("access", () => {
    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "denies the audit history to the %s role",
      async (roleName) => {
        const response = await listLogs("", tokens[roleName]).expect(403);

        expect(response.body).toMatchObject({
          error: { code: "INSUFFICIENT_PERMISSIONS" },
        });
      },
    );

    it("rejects requests without an access token", async () => {
      await listLogs("").expect(401);
    });
  });

  describe("read-only endpoint", () => {
    it.each(["post", "put", "patch", "delete"] as const)(
      "answers 404 for a %s request over /audit-logs",
      async (method) => {
        await request(app.getHttpServer())
          [method]("/api/v1/audit-logs")
          .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
          .send({ action: "CREATE" })
          .expect(404);
      },
    );
  });
});
