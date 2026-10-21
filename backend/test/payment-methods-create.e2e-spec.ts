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

interface PaymentMethodBody {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const runId = Date.now().toString(36).toUpperCase();
const DOCUMENT_CODE = `PM-CREATE-${runId}`;
const paymentMethodOf = (body: unknown) =>
  (body as { data: PaymentMethodBody }).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

describe("POST /api/v1/payment-methods (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;
  const usedCodes = new Set<string>();

  const nextCode = (label: string) => {
    sequence += 1;
    const code = `${runId}_${label}${sequence}`;
    usedCodes.add(code);
    return code;
  };

  const paymentMethodCount = (code: string) =>
    prisma.paymentMethod.count({ where: { code } });

  const postPaymentMethod = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post(
      "/api/v1/payment-methods",
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

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
        create: {
          code: DOCUMENT_CODE,
          name: "Cédula (e2e crear método de pago)",
        },
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
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.payment-methods.${runId}@e2e.test`,
          phone: "3009998877",
          address: "Carrera 9 # 8-7",
          userAccount: {
            create: {
              roleId: role.id,
              active: true,
              mustChangePassword: false,
            },
          },
        },
      });
      actorIds[roleName] = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }
  }, 30000);

  afterAll(async () => {
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
    await app.close();
  }, 30000);

  describe("successful creation", () => {
    it("creates the payment method and persists it", async () => {
      const code = nextCode("OK");
      const name = "Nequi E2E";

      const response = await postPaymentMethod(
        { code, name },
        tokens.SUPERADMIN,
      ).expect(201);

      const paymentMethod = paymentMethodOf(response.body);
      expect(paymentMethod).toMatchObject({
        id: expect.any(String),
        code,
        name,
        active: true,
      });
      expect(paymentMethod.createdAt).toEqual(expect.any(String));
      expect(paymentMethod.updatedAt).toEqual(expect.any(String));
      expect(await paymentMethodCount(code)).toBe(1);

      await expect(
        prisma.paymentMethod.findUniqueOrThrow({ where: { code } }),
      ).resolves.toMatchObject({
        id: paymentMethod.id,
        name,
        active: true,
      });
    });
  });

  describe("duplicate code", () => {
    it("answers 409 when the code already exists", async () => {
      const code = nextCode("DUP");
      await prisma.paymentMethod.create({
        data: { code, name: "Método existente" },
      });

      const response = await postPaymentMethod(
        { code, name: "Método duplicado" },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "PAYMENT_METHOD_CODE_ALREADY_EXISTS",
        message: "A payment method with this code already exists.",
        details: {},
      });
      expect(await paymentMethodCount(code)).toBe(1);
    });
  });

  describe("validation", () => {
    it("rejects a lowercase code without creating it", async () => {
      const code = `${runId.toLowerCase()}_lower`;
      usedCodes.add(code);

      const response = await postPaymentMethod(
        { code, name: "Método en minúsculas" },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        code: "BAD_REQUEST",
        message: "Request validation failed.",
      });
      expect(errorOf(response.body).details).toEqual(
        expect.arrayContaining([expect.stringContaining("code")]),
      );
      expect(await paymentMethodCount(code)).toBe(0);
    });
  });

  describe("role access", () => {
    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
      "rejects %s with 403 without creating the payment method",
      async (roleName) => {
        const code = nextCode("FORBIDDEN");

        const response = await postPaymentMethod(
          { code, name: "Método no autorizado" },
          tokens[roleName],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect(await paymentMethodCount(code)).toBe(0);
      },
    );

    it("rejects a request without an access token", async () => {
      const code = nextCode("NO_TOKEN");

      await postPaymentMethod({ code, name: "Método sin token" }).expect(401);

      expect(await paymentMethodCount(code)).toBe(0);
    });
  });
});
