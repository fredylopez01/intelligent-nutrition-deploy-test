import { jest, describe, beforeEach, afterEach, it, expect } from "@jest/globals";
import { ValidationPipe } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdatePaymentMethodDto } from "./dto/update-payment-method.dto.js";
import { UpdatePaymentMethodStatusDto } from "./dto/update-payment-method-status.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: typeof prismaMock) => Promise<unknown>;

interface PaymentMethodRecord {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const paymentMethodId = "55555555-5555-4555-8555-555555555555";

const prismaMock = {
  $transaction:
    jest.fn<(op: TransactionOperation | Array<Promise<unknown>>) => Promise<unknown>>(),
  paymentMethod: {
    findUnique: jest.fn<AsyncMock>(),
    findFirst:  jest.fn<AsyncMock>(),
    update:     jest.fn<AsyncMock>(),
  },
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test }                   = await import("@nestjs/testing");
const { PaymentMethodsService }  = await import("./payment-methods.service.js");
const { PrismaService }          = await import("../../database/prisma/prisma.service.js");
const { AuditService }           = await import("../audit/audit.service.js");

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const createdAt = new Date("2026-10-21T13:30:00.000Z");

const currentUser: AuthenticatedUser = {
  id: "admin-user-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

function buildPaymentMethod(
  overrides: Partial<PaymentMethodRecord> = {},
): PaymentMethodRecord {
  return {
    id: paymentMethodId,
    code: "NEQUI",
    name: "Nequi",
    active: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

async function validateBody(
  body: Record<string, unknown>,
  metatype: new () => object,
) {
  return validationPipe.transform(body, { type: "body", metatype });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:paymentMethodId
// ─────────────────────────────────────────────────────────────────────────────

describe("PaymentMethodsService.update", () => {
  let service: InstanceType<typeof PaymentMethodsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((op) =>
      Array.isArray(op) ? Promise.all(op) : op(prismaMock),
    );
    prismaMock.paymentMethod.findUnique.mockResolvedValue(buildPaymentMethod());
    prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
    prismaMock.paymentMethod.update.mockResolvedValue(buildPaymentMethod());
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(PaymentMethodsService);
  });

  describe("not found", () => {
    it("throws PAYMENT_METHOD_NOT_FOUND when the record does not exist", async () => {
      prismaMock.paymentMethod.findUnique.mockResolvedValue(null);

      await expect(
        service.update(paymentMethodId, { name: "NewName" }, currentUser),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "PAYMENT_METHOD_NOT_FOUND" },
      });

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("no-op when nothing changes", () => {
    it("returns the existing record without calling update when code and name are the same", async () => {
      const existing = buildPaymentMethod();
      prismaMock.paymentMethod.findUnique.mockResolvedValue(existing);

      const result = await service.update(
        paymentMethodId,
        { code: existing.code, name: existing.name },
        currentUser,
      );

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it("returns the existing record without update when DTO has no fields", async () => {
      const existing = buildPaymentMethod();
      prismaMock.paymentMethod.findUnique.mockResolvedValue(existing);

      const result = await service.update(paymentMethodId, {}, currentUser);

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  describe("code update", () => {
    it("updates only the code when it changes to a unique value", async () => {
      const existing = buildPaymentMethod();
      const updated  = buildPaymentMethod({ code: "DAVIPLATA" });
      prismaMock.paymentMethod.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
      prismaMock.paymentMethod.update.mockResolvedValue(updated);

      await service.update(paymentMethodId, { code: "DAVIPLATA" }, currentUser);

      expect(prismaMock.paymentMethod.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { code: "DAVIPLATA" } }),
      );
    });

    it("rejects when the new code is already taken by another record", async () => {
      const existing = buildPaymentMethod();
      prismaMock.paymentMethod.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: "another-id" });

      await expect(
        service.update(paymentMethodId, { code: "DAVIPLATA" }, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "PAYMENT_METHOD_CODE_ALREADY_EXISTS" },
      });

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
    });

    it("skips the code uniqueness check when the code is unchanged", async () => {
      const existing = buildPaymentMethod();
      prismaMock.paymentMethod.findUnique.mockResolvedValue(existing);

      await service.update(paymentMethodId, { code: existing.code }, currentUser);

      expect(prismaMock.paymentMethod.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe("name update", () => {
    it("updates only the name when it changes to a unique value", async () => {
      const existing = buildPaymentMethod();
      const updated  = buildPaymentMethod({ name: "Daviplata" });
      prismaMock.paymentMethod.findUnique.mockResolvedValue(existing);
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
      prismaMock.paymentMethod.update.mockResolvedValue(updated);

      await service.update(paymentMethodId, { name: "Daviplata" }, currentUser);

      expect(prismaMock.paymentMethod.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: "Daviplata" } }),
      );
    });

    it("rejects when the new name is already taken by another record", async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: "another-id" });

      await expect(
        service.update(paymentMethodId, { name: "Daviplata" }, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "PAYMENT_METHOD_NAME_ALREADY_EXISTS" },
      });

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
    });

    it("excludes self when checking name uniqueness", async () => {
      await service.update(paymentMethodId, { name: "Daviplata" }, currentUser);

      expect(prismaMock.paymentMethod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: paymentMethodId } }),
        }),
      );
    });

    it("skips the name uniqueness check when the name is unchanged", async () => {
      const existing = buildPaymentMethod();
      prismaMock.paymentMethod.findUnique.mockResolvedValue(existing);

      await service.update(paymentMethodId, { name: existing.name }, currentUser);

      expect(prismaMock.paymentMethod.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("audit log", () => {
    it("records audit log with oldData and newData reflecting only changed fields", async () => {
      const existing = buildPaymentMethod();
      const updated  = buildPaymentMethod({ name: "Daviplata" });
      prismaMock.paymentMethod.findUnique.mockResolvedValue(existing);
      prismaMock.paymentMethod.update.mockResolvedValue(updated);

      await service.update(paymentMethodId, { name: "Daviplata" }, currentUser, "127.0.0.1");

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   "admin-user-id",
          action:   "UPDATE",
          entity:   "PAYMENT_METHOD",
          entityId: paymentMethodId,
          oldData:  { name: "Nequi" },
          newData:  { name: "Daviplata" },
          ipAddress: "127.0.0.1",
        }),
        prismaMock,
      );
    });

    it("does not call createAuditLog when nothing changed", async () => {
      const existing = buildPaymentMethod();
      prismaMock.paymentMethod.findUnique.mockResolvedValue(existing);

      await service.update(paymentMethodId, { name: existing.name }, currentUser);

      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("database error handling", () => {
    it("maps a P2002 unique constraint error to PAYMENT_METHOD_CODE_ALREADY_EXISTS", async () => {
      prismaMock.paymentMethod.update.mockRejectedValue({ code: "P2002" });
      prismaMock.paymentMethod.findUnique
        .mockResolvedValueOnce(buildPaymentMethod())
        .mockResolvedValueOnce(null);

      await expect(
        service.update(paymentMethodId, { code: "DAVIPLATA" }, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "PAYMENT_METHOD_CODE_ALREADY_EXISTS" },
      });
    });

    it("does not swallow unexpected errors", async () => {
      const error = new Error("connection lost");
      prismaMock.paymentMethod.findUnique.mockRejectedValue(error);

      await expect(
        service.update(paymentMethodId, { name: "Daviplata" }, currentUser),
      ).rejects.toBe(error);
    });
  });

  describe("DTO validation", () => {
    it("rejects a code with lowercase letters", async () => {
      await expect(
        validateBody({ code: "nequi" }, UpdatePaymentMethodDto),
      ).rejects.toThrow();
    });

    it("rejects a code longer than 30 characters", async () => {
      await expect(
        validateBody({ code: "A".repeat(31) }, UpdatePaymentMethodDto),
      ).rejects.toThrow();
    });

    it("rejects an empty string code", async () => {
      await expect(
        validateBody({ code: "" }, UpdatePaymentMethodDto),
      ).rejects.toThrow();
    });

    it("rejects a name longer than 100 characters", async () => {
      await expect(
        validateBody({ name: "N".repeat(101) }, UpdatePaymentMethodDto),
      ).rejects.toThrow();
    });

    it("rejects unknown top-level fields", async () => {
      await expect(
        validateBody({ name: "Nequi", extra: "value" }, UpdatePaymentMethodDto),
      ).rejects.toThrow();
    });

    it("accepts a DTO with only code", async () => {
      await expect(
        validateBody({ code: "NEQUI_V2" }, UpdatePaymentMethodDto),
      ).resolves.toBeDefined();
    });

    it("accepts a DTO with only name", async () => {
      await expect(
        validateBody({ name: "Nequi V2" }, UpdatePaymentMethodDto),
      ).resolves.toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:paymentMethodId/status
// ─────────────────────────────────────────────────────────────────────────────

describe("PaymentMethodsService.updateStatus", () => {
  let service: InstanceType<typeof PaymentMethodsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((op) =>
      Array.isArray(op) ? Promise.all(op) : op(prismaMock),
    );
    prismaMock.paymentMethod.findUnique.mockResolvedValue(
      buildPaymentMethod({ active: true }),
    );
    prismaMock.paymentMethod.update.mockResolvedValue({});
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(PaymentMethodsService);
  });

  describe("not found", () => {
    it("throws PAYMENT_METHOD_NOT_FOUND when the record does not exist", async () => {
      prismaMock.paymentMethod.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(paymentMethodId, false, currentUser),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "PAYMENT_METHOD_NOT_FOUND" },
      });

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
    });
  });

  describe("already in state", () => {
    it("rejects when trying to activate an already active method", async () => {
      prismaMock.paymentMethod.findUnique.mockResolvedValue(
        buildPaymentMethod({ active: true }),
      );

      await expect(
        service.updateStatus(paymentMethodId, true, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "ALREADY_IN_STATE" },
      });

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
    });

    it("rejects when trying to deactivate an already inactive method", async () => {
      prismaMock.paymentMethod.findUnique.mockResolvedValue(
        buildPaymentMethod({ active: false }),
      );

      await expect(
        service.updateStatus(paymentMethodId, false, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "ALREADY_IN_STATE" },
      });

      expect(prismaMock.paymentMethod.update).not.toHaveBeenCalled();
    });

    it("maps a P2025 record-not-found error to ALREADY_IN_STATE", async () => {
      prismaMock.paymentMethod.update.mockRejectedValue({ code: "P2025" });

      await expect(
        service.updateStatus(paymentMethodId, false, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "ALREADY_IN_STATE" },
      });
    });
  });

  describe("activate", () => {
    it("activates an inactive method successfully", async () => {
      prismaMock.paymentMethod.findUnique.mockResolvedValue(
        buildPaymentMethod({ active: false }),
      );

      const result = await service.updateStatus(paymentMethodId, true, currentUser);

      expect(prismaMock.paymentMethod.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: true } }),
      );
      expect(result).toEqual({ message: "Payment method status updated successfully." });
    });

    it("records an ACTIVATE audit log", async () => {
      prismaMock.paymentMethod.findUnique.mockResolvedValue(
        buildPaymentMethod({ active: false }),
      );

      await service.updateStatus(paymentMethodId, true, currentUser, "127.0.0.1");

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId:   "admin-user-id",
          action:   "ACTIVATE",
          entity:   "PAYMENT_METHOD",
          entityId: paymentMethodId,
          oldData:  { active: false },
          newData:  { active: true },
          ipAddress: "127.0.0.1",
        }),
        prismaMock,
      );
    });
  });

  describe("deactivate", () => {
    it("deactivates an active method successfully", async () => {
      const result = await service.updateStatus(paymentMethodId, false, currentUser);

      expect(prismaMock.paymentMethod.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
      expect(result).toEqual({ message: "Payment method status updated successfully." });
    });

    it("records a DEACTIVATE audit log", async () => {
      await service.updateStatus(paymentMethodId, false, currentUser, "127.0.0.1");

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action:  "DEACTIVATE",
          oldData: { active: true },
          newData: { active: false },
        }),
        prismaMock,
      );
    });
  });

  describe("database error handling", () => {
    it("does not swallow unexpected errors", async () => {
      const error = new Error("connection lost");
      prismaMock.paymentMethod.update.mockRejectedValue(error);

      await expect(
        service.updateStatus(paymentMethodId, false, currentUser),
      ).rejects.toBe(error);
    });
  });

  describe("DTO validation", () => {
    it("rejects when active field is missing", async () => {
      await expect(
        validateBody({}, UpdatePaymentMethodStatusDto),
      ).rejects.toThrow();
    });

    it("rejects a string instead of boolean", async () => {
      await expect(
        validateBody({ active: "true" }, UpdatePaymentMethodStatusDto),
      ).rejects.toThrow();
    });

    it("rejects unknown fields", async () => {
      await expect(
        validateBody({ active: true, extra: "value" }, UpdatePaymentMethodStatusDto),
      ).rejects.toThrow();
    });

    it("accepts active: true", async () => {
      await expect(
        validateBody({ active: true }, UpdatePaymentMethodStatusDto),
      ).resolves.toBeDefined();
    });

    it("accepts active: false", async () => {
      await expect(
        validateBody({ active: false }, UpdatePaymentMethodStatusDto),
      ).resolves.toBeDefined();
    });
  });
});
