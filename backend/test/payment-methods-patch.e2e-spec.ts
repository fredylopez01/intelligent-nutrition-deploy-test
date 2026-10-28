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

interface PaymentMethodBody {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const runId = Date.now().toString(36).toUpperCase();
const DOCUMENT_CODE = `PM-PATCH-${runId}`;

const paymentMethodOf = (body: unknown) =>
  (body as { data: PaymentMethodBody }).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } }).error;

describe("PATCH /api/v1/payment-methods (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;

  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;
  const usedCodes = new Set<string>();

  const nextCode = (label: string) => {
    sequence += 1;
    const code = `PM${runId}_${label}${sequence}`;
    usedCodes.add(code);
    return code;
  };

  const createPaymentMethod = async (
    code: string,
    name: string,
    active = true,
  ) => {
    return prisma.paymentMethod.create({ data: { code, name, active } });
  };

  const patchPaymentMethod = (
    id: string,
    body: object,
    token?: string,
  ) => {
    const pending = request(app.getHttpServer())
      .patch(`/api/v1/payment-methods/${id}`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const patchStatus = (id: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer())
      .patch(`/api/v1/payment-methods/${id}/status`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const auditLogsFor = (entityId: string, action: string) =>
    prisma.auditLog.findMany({
      where: {
        userId: actorIds.SUPERADMIN,
        entity: "PAYMENT_METHOD",
        entityId,
        action,
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

    documentTypeId = (
      await prisma.documentType.upsert({
        where: { code: DOCUMENT_CODE },
        update: { active: true },
        create: { code: DOCUMENT_CODE, name: "Document (e2e patch payment-methods)" },
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
          documentNumber: `${runId}${roleName.length}${sequence++}`,
          firstName: roleName,
          lastName: "E2E-PM-PATCH",
          email: `${roleName.toLowerCase()}.pm-patch.${runId}@e2e.test`,
          phone: "3009998877",
          address: "Carrera 9 # 8-7",
          userAccount: {
            create: { roleId: role.id, active: true, mustChangePassword: false },
          },
        },
      });
      actorIds[roleName] = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: Object.values(actorIds) } },
      });
      await prisma.paymentMethod.deleteMany({
        where: { code: { in: [...usedCodes] } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: Object.values(actorIds) } },
      });
      await prisma.person.deleteMany({
        where: { id: { in: Object.values(actorIds) } },
      });
      await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });
    } finally {
      await app.close();
    }
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /:id — update code / name
  // ─────────────────────────────────────────────────────────────────────────────

  describe("PATCH /:id — successful update", () => {
    it("updates the code and returns the new value → 200", async () => {
      const oldCode = nextCode("OLD_CODE");
      const newCode = nextCode("NEW_CODE");
      const pm = await createPaymentMethod(oldCode, `Name for ${oldCode}`);

      const response = await patchPaymentMethod(
        pm.id,
        { code: newCode },
        tokens.SUPERADMIN,
      );

      expect(response.status).toBe(200);
      const body = paymentMethodOf(response.body);
      expect(body.code).toBe(newCode);
      expect(body.name).toBe(pm.name);
      expect(body.active).toBe(true);

      const inDb = await prisma.paymentMethod.findUnique({
        where: { id: pm.id },
      });
      expect(inDb?.code).toBe(newCode);
    });

    it("updates the name and returns the new value → 200", async () => {
      const code = nextCode("NAME_UPD");
      const pm = await createPaymentMethod(code, "Original name E2E");

      const response = await patchPaymentMethod(
        pm.id,
        { name: "Updated name E2E" },
        tokens.SUPERADMIN,
      );

      expect(response.status).toBe(200);
      expect(paymentMethodOf(response.body).name).toBe("Updated name E2E");

      const inDb = await prisma.paymentMethod.findUnique({
        where: { id: pm.id },
      });
      expect(inDb?.name).toBe("Updated name E2E");
    });

    it("updates both code and name in one request → 200", async () => {
      const oldCode = nextCode("BOTH_OLD");
      const newCode = nextCode("BOTH_NEW");
      const pm = await createPaymentMethod(oldCode, "Both original");

      const response = await patchPaymentMethod(
        pm.id,
        { code: newCode, name: "Both updated" },
        tokens.SUPERADMIN,
      );

      expect(response.status).toBe(200);
      const body = paymentMethodOf(response.body);
      expect(body.code).toBe(newCode);
      expect(body.name).toBe("Both updated");
    });

    it("records an audit log with oldData and newData on code update → UPDATE", async () => {
      const oldCode = nextCode("AUDIT_OLD");
      const newCode = nextCode("AUDIT_NEW");
      const pm = await createPaymentMethod(oldCode, `Audit test ${oldCode}`);

      await patchPaymentMethod(pm.id, { code: newCode }, tokens.SUPERADMIN);

      const logs = await auditLogsFor(pm.id, "UPDATE");
      expect(logs).toHaveLength(1);
      expect(logs[0].oldData).toMatchObject({ code: oldCode });
      expect(logs[0].newData).toMatchObject({ code: newCode });
    });

    it("returns the existing record without creating an audit log when nothing changes → 200", async () => {
      const code = nextCode("NOOP");
      const pm = await createPaymentMethod(code, "No-op name");
      const logsBefore = await auditLogsFor(pm.id, "UPDATE");

      const response = await patchPaymentMethod(
        pm.id,
        { code, name: "No-op name" },
        tokens.SUPERADMIN,
      );

      expect(response.status).toBe(200);
      expect(paymentMethodOf(response.body).id).toBe(pm.id);
      const logsAfter = await auditLogsFor(pm.id, "UPDATE");
      expect(logsAfter).toHaveLength(logsBefore.length);
    });
  });

  describe("PATCH /:id — business errors", () => {
    it("returns 404 PAYMENT_METHOD_NOT_FOUND with a nonexistent UUID", async () => {
      const response = await patchPaymentMethod(
        randomUUID(),
        { name: "Ghost" },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("PAYMENT_METHOD_NOT_FOUND");
    });

    it("returns 409 PAYMENT_METHOD_CODE_ALREADY_EXISTS when the new code belongs to another record", async () => {
      const existingCode = nextCode("TAKEN_CODE");
      await createPaymentMethod(existingCode, "Already taken");
      const code = nextCode("OWN_CODE");
      const pm = await createPaymentMethod(code, "Own record");

      const response = await patchPaymentMethod(
        pm.id,
        { code: existingCode },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(409);
      expect(errorOf(response.body).code).toBe("PAYMENT_METHOD_CODE_ALREADY_EXISTS");

      const inDb = await prisma.paymentMethod.findUnique({ where: { id: pm.id } });
      expect(inDb?.code).toBe(code);
    });

    it("returns 409 PAYMENT_METHOD_NAME_ALREADY_EXISTS when the new name belongs to another record", async () => {
      const code1 = nextCode("N_TAKEN");
      const code2 = nextCode("N_OWN");
      await createPaymentMethod(code1, "Taken name E2E");
      const pm = await createPaymentMethod(code2, "Own name E2E");

      const response = await patchPaymentMethod(
        pm.id,
        { name: "Taken name E2E" },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(409);
      expect(errorOf(response.body).code).toBe("PAYMENT_METHOD_NAME_ALREADY_EXISTS");
    });
  });

  describe("PATCH /:id — DTO validation", () => {
    it("returns 400 when code contains lowercase letters", async () => {
      const code = nextCode("VALID");
      const pm = await createPaymentMethod(code, "DTO test");

      const response = await patchPaymentMethod(
        pm.id,
        { code: "lowercase_code" },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when code exceeds 30 characters", async () => {
      const code = nextCode("LONG");
      const pm = await createPaymentMethod(code, "Long code test");

      const response = await patchPaymentMethod(
        pm.id,
        { code: "A".repeat(31) },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when name exceeds 100 characters", async () => {
      const code = nextCode("LONG_NAME");
      const pm = await createPaymentMethod(code, "Long name test");

      const response = await patchPaymentMethod(
        pm.id,
        { name: "A".repeat(101) },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when code is an empty string", async () => {
      const code = nextCode("EMPTY_CODE");
      const pm = await createPaymentMethod(code, "Empty code test");

      const response = await patchPaymentMethod(
        pm.id,
        { code: "" },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when the route param is not a valid UUID", async () => {
      const response = await patchPaymentMethod(
        "not-a-uuid",
        { name: "test" },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /:id — authorization", () => {
    it("returns 401 when no token is provided", async () => {
      const code = nextCode("NOAUTH");
      const pm = await createPaymentMethod(code, "No auth test");

      const response = await patchPaymentMethod(pm.id, { name: "Updated" });
      expect(response.status).toBe(401);
    });

    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
      "returns 403 for %s role",
      async (roleName) => {
        const code = nextCode("RL");
        const pm = await createPaymentMethod(code, `Role test ${roleName}`);

        const response = await patchPaymentMethod(
          pm.id,
          { name: "Should not change" },
          tokens[roleName],
        );
        expect(response.status).toBe(403);
        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");

        const inDb = await prisma.paymentMethod.findUnique({ where: { id: pm.id } });
        expect(inDb?.name).toBe(`Role test ${roleName}`);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH /:id/status — activate / deactivate
  // ─────────────────────────────────────────────────────────────────────────────

  describe("PATCH /:id/status — successful status update", () => {
    it("deactivates an active payment method → 200 with message", async () => {
      const code = nextCode("DEACT");
      const pm = await createPaymentMethod(code, "To deactivate", true);

      const response = await patchStatus(
        pm.id,
        { active: false },
        tokens.SUPERADMIN,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        data: { message: "Payment method status updated successfully." },
      });

      const inDb = await prisma.paymentMethod.findUnique({ where: { id: pm.id } });
      expect(inDb?.active).toBe(false);
    });

    it("activates an inactive payment method → 200 with message", async () => {
      const code = nextCode("ACT");
      const pm = await createPaymentMethod(code, "To activate", false);

      const response = await patchStatus(
        pm.id,
        { active: true },
        tokens.SUPERADMIN,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        data: { message: "Payment method status updated successfully." },
      });

      const inDb = await prisma.paymentMethod.findUnique({ where: { id: pm.id } });
      expect(inDb?.active).toBe(true);
    });

    it("records a DEACTIVATE audit log with correct old/new data", async () => {
      const code = nextCode("AUDIT_DEACT");
      const pm = await createPaymentMethod(code, "Audit deactivate", true);

      await patchStatus(pm.id, { active: false }, tokens.SUPERADMIN);

      const logs = await auditLogsFor(pm.id, "DEACTIVATE");
      expect(logs).toHaveLength(1);
      expect(logs[0].oldData).toMatchObject({ active: true });
      expect(logs[0].newData).toMatchObject({ active: false });
    });

    it("records an ACTIVATE audit log with correct old/new data", async () => {
      const code = nextCode("AUDIT_ACT");
      const pm = await createPaymentMethod(code, "Audit activate", false);

      await patchStatus(pm.id, { active: true }, tokens.SUPERADMIN);

      const logs = await auditLogsFor(pm.id, "ACTIVATE");
      expect(logs).toHaveLength(1);
      expect(logs[0].oldData).toMatchObject({ active: false });
      expect(logs[0].newData).toMatchObject({ active: true });
    });
  });

  describe("PATCH /:id/status — business errors", () => {
    it("returns 409 ALREADY_IN_STATE when trying to activate an already active record", async () => {
      const code = nextCode("ALREADY_ACT");
      const pm = await createPaymentMethod(code, "Already active", true);

      const response = await patchStatus(
        pm.id,
        { active: true },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(409);
      expect(errorOf(response.body).code).toBe("ALREADY_IN_STATE");
    });

    it("returns 409 ALREADY_IN_STATE when trying to deactivate an already inactive record", async () => {
      const code = nextCode("ALREADY_DEACT");
      const pm = await createPaymentMethod(code, "Already inactive", false);

      const response = await patchStatus(
        pm.id,
        { active: false },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(409);
      expect(errorOf(response.body).code).toBe("ALREADY_IN_STATE");
    });

    it("returns 404 PAYMENT_METHOD_NOT_FOUND with a nonexistent UUID", async () => {
      const response = await patchStatus(
        randomUUID(),
        { active: false },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("PAYMENT_METHOD_NOT_FOUND");
    });
  });

  describe("PATCH /:id/status — DTO validation", () => {
    it("returns 400 when active field is missing", async () => {
      const code = nextCode("MISS_ACT");
      const pm = await createPaymentMethod(code, "Missing active");

      const response = await patchStatus(pm.id, {}, tokens.SUPERADMIN);
      expect(response.status).toBe(400);
    });

    it("returns 400 when active is a string instead of a boolean", async () => {
      const code = nextCode("STR_ACT");
      const pm = await createPaymentMethod(code, "String active");

      const response = await patchStatus(
        pm.id,
        { active: "false" },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when the route param is not a valid UUID", async () => {
      const response = await patchStatus(
        "not-a-uuid",
        { active: false },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /:id/status — authorization", () => {
    it("returns 401 when no token is provided", async () => {
      const code = nextCode("STA_NOAUTH");
      const pm = await createPaymentMethod(code, "No auth status");

      const response = await patchStatus(pm.id, { active: false });
      expect(response.status).toBe(401);
    });

    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
      "returns 403 for %s role",
      async (roleName) => {
        const code = nextCode("SL");
        const pm = await createPaymentMethod(code, `Status role test ${roleName}`, true);

        const response = await patchStatus(
          pm.id,
          { active: false },
          tokens[roleName],
        );
        expect(response.status).toBe(403);
        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");

        const inDb = await prisma.paymentMethod.findUnique({ where: { id: pm.id } });
        expect(inDb?.active).toBe(true);
      },
    );
  });
});
