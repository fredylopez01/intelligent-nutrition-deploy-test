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

const errorCode = (body: unknown) =>
  (body as { error: { code: string } }).error.code;
const DOCUMENT_CODE = "CC-CUST-E2E";

describe("PATCH /api/v1/customers/:customerId/status (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const personIds: string[] = [];
  const userIds: string[] = [];

  const patchStatus = (customerId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/customers/${customerId}/status`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const createCustomer = async (active: boolean) => {
    const person = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: nextDocument(),
        firstName: "Cliente",
        lastName: `E2E ${sequence}`,
        email: `cliente.${sequence}.${runId}@e2e.test`,
        phone: "3001112233",
        address: "Calle 20 # 10-15",
        customer: {
          create: { fullName: `Cliente E2E ${sequence}`, active },
        },
      },
    });
    personIds.push(person.id);
    return person.id;
  };

  const isActive = async (customerId: string) =>
    (
      await prisma.customer.findUniqueOrThrow({
        where: { personId: customerId },
      })
    ).active;

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
      where: { code: DOCUMENT_CODE },
      update: { active: true },
      create: { code: DOCUMENT_CODE, name: "Cédula (e2e clientes)" },
    });
    documentTypeId = documentType.id;

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
          documentNumber: nextDocument(),
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.customers.${runId}@e2e.test`,
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
      personIds.push(person.id);
      userIds.push(person.id);
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.customer.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });
    await app.close();
  }, 30000);

  describe("allowed roles", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER"])(
      "lets %s deactivate a customer and records the audit log",
      async (roleName) => {
        const customerId = await createCustomer(true);

        const response = await patchStatus(
          customerId,
          { active: false },
          tokens[roleName],
        ).expect(200);

        expect(response.body).toEqual({
          data: { message: "Customer status updated successfully." },
        });
        expect(await isActive(customerId)).toBe(false);
        const logs = await prisma.auditLog.findMany({
          where: { entity: "CUSTOMER", entityId: customerId },
        });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          action: "DEACTIVATE",
          oldData: { active: true },
          newData: { active: false },
        });
      },
    );

    it("lets the branch leader activate an inactive customer", async () => {
      const customerId = await createCustomer(false);

      await patchStatus(
        customerId,
        { active: true },
        tokens.BRANCH_LEADER,
      ).expect(200);

      expect(await isActive(customerId)).toBe(true);
    });
  });

  describe("rejected roles", () => {
    it.each<RoleName>(["BRANCH_ASSISTANT", "DEV"])(
      "rejects %s with 403 and leaves the customer unchanged",
      async (roleName) => {
        const customerId = await createCustomer(true);

        const response = await patchStatus(
          customerId,
          { active: false },
          tokens[roleName],
        ).expect(403);

        expect(errorCode(response.body)).toBe("INSUFFICIENT_PERMISSIONS");
        expect(await isActive(customerId)).toBe(true);
      },
    );

    it("rejects a request without token with 401", async () => {
      const customerId = await createCustomer(true);

      await patchStatus(customerId, { active: false }).expect(401);

      expect(await isActive(customerId)).toBe(true);
    });
  });

  describe("business rules", () => {
    it("answers 409 ALREADY_IN_STATE when the state does not change", async () => {
      const customerId = await createCustomer(true);

      const response = await patchStatus(
        customerId,
        { active: true },
        tokens.BRANCH_LEADER,
      ).expect(409);

      expect(errorCode(response.body)).toBe("ALREADY_IN_STATE");
    });

    it("answers 404 for a customer that does not exist", async () => {
      await patchStatus(
        randomUUID(),
        { active: false },
        tokens.BRANCH_LEADER,
      ).expect(404);
    });
  });
});
