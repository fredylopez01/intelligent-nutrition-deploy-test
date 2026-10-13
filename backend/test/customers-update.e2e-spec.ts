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

interface CustomerResponse {
  data: {
    id: string;
    fullName: string;
    active: boolean;
    person: {
      id: string;
      documentTypeId: string;
      documentNumber: string;
      firstName: string | null;
      lastName: string | null;
      businessName: string | null;
      email: string;
      phone: string;
      address: string;
      active: boolean;
    };
  };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-CUST-UPD-${runId}`;
const customerOf = (body: unknown) => (body as CustomerResponse).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

describe("PATCH /api/v1/customers/:customerId (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];
  const fixturePersonIds: string[] = [];

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const nextEmail = (label = "cliente") => {
    sequence += 1;
    return `${label}.${runId}.${sequence}@e2e.test`;
  };

  const patchCustomer = (customerId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer())
      .patch(`/api/v1/customers/${customerId}`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const createCustomer = async () => {
    const person = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: nextDocument(),
        firstName: "Marta",
        lastName: `Rojas ${sequence}`,
        email: nextEmail(),
        phone: "3004445566",
        address: "Carrera 7 # 6-5",
        customer: {
          create: { fullName: `Marta Rojas ${sequence}` },
        },
      },
    });
    fixturePersonIds.push(person.id);
    return person.id;
  };

  const findCustomer = (customerId: string) =>
    prisma.customer.findUniqueOrThrow({
      where: { personId: customerId },
      include: { person: true },
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
        create: {
          code: DOCUMENT_CODE,
          name: "Cédula (e2e actualizar cliente)",
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
          documentNumber: nextDocument(),
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.customers.update.${runId}@e2e.test`,
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
      actorIds.push(person.id);
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: actorIds } },
          { entityId: { in: fixturePersonIds } },
        ],
      },
    });
    await prisma.customer.deleteMany({
      where: { personId: { in: fixturePersonIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: actorIds } },
    });
    await prisma.person.deleteMany({
      where: { id: { in: [...actorIds, ...fixturePersonIds] } },
    });
    await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });
    await app.close();
  }, 30000);

  describe("successful update", () => {
    it("updates the person profile and customer full name", async () => {
      const customerId = await createCustomer();

      const response = await patchCustomer(
        customerId,
        {
          person: {
            firstName: "Marta Lucía",
            lastName: "Rojas Pérez",
            email: "Marta.Rojas@E2E.test",
            phone: "3117654321",
            address: "Calle 30 # 15-20",
          },
        },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(customerOf(response.body)).toMatchObject({
        id: customerId,
        fullName: "Marta Lucía Rojas Pérez",
        active: true,
        person: {
          id: customerId,
          documentTypeId,
          firstName: "Marta Lucía",
          lastName: "Rojas Pérez",
          email: "marta.rojas@e2e.test",
          phone: "3117654321",
          address: "Calle 30 # 15-20",
          active: true,
        },
      });

      expect(await findCustomer(customerId)).toMatchObject({
        fullName: "Marta Lucía Rojas Pérez",
        person: {
          firstName: "Marta Lucía",
          lastName: "Rojas Pérez",
          email: "marta.rojas@e2e.test",
          phone: "3117654321",
          address: "Calle 30 # 15-20",
        },
      });

      const logs = await prisma.auditLog.findMany({
        where: { entity: "CUSTOMER", entityId: customerId, action: "UPDATE" },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        userId: actorIds[0],
        oldData: {
          fullName: expect.stringContaining("Marta Rojas"),
        },
        newData: {
          fullName: "Marta Lucía Rojas Pérez",
          person: {
            firstName: "Marta Lucía",
            lastName: "Rojas Pérez",
            phone: "3117654321",
          },
        },
      });
    });

    it("updates a company name and derives the customer full name from it", async () => {
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: nextDocument(),
          businessName: "Nutrición Inicial SAS",
          email: nextEmail("empresa"),
          phone: "3004445566",
          address: "Carrera 7 # 6-5",
          customer: { create: { fullName: "Nutrición Inicial SAS" } },
        },
      });
      fixturePersonIds.push(person.id);

      const response = await patchCustomer(
        person.id,
        { person: { businessName: "Nutrición Renovada SAS" } },
        tokens.BRANCH_LEADER,
      ).expect(200);

      expect(customerOf(response.body)).toMatchObject({
        id: person.id,
        fullName: "Nutrición Renovada SAS",
        person: { businessName: "Nutrición Renovada SAS" },
      });
      expect((await findCustomer(person.id)).fullName).toBe(
        "Nutrición Renovada SAS",
      );
    });
  });

  describe("validation", () => {
    it.each([
      ["empty request body", {}],
      ["empty person block", { person: {} }],
    ])("rejects an %s", async (_label, body) => {
      const customerId = await createCustomer();

      const response = await patchCustomer(
        customerId,
        body,
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        code: "BAD_REQUEST",
        message: "At least one person field must be provided",
      });
    });

    it.each([
      ["invalid email", { email: "not-an-email" }],
      ["invalid phone", { phone: "300abc" }],
      ["document number without document type", { documentNumber: "123456" }],
    ])("rejects %s without changing the customer", async (_label, person) => {
      const customerId = await createCustomer();
      const before = await findCustomer(customerId);

      const response = await patchCustomer(
        customerId,
        { person },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
      expect(await findCustomer(customerId)).toEqual(before);
    });

    it("rejects a profile update that would leave the customer without a name", async () => {
      const customerId = await createCustomer();

      const response = await patchCustomer(
        customerId,
        { person: { firstName: null, lastName: null } },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).message).toBe(
        "Person must have a businessName or a firstName and lastName",
      );
    });
  });

  describe("not found", () => {
    it("answers 404 when the customer does not exist", async () => {
      const response = await patchCustomer(
        randomUUID(),
        { person: { phone: "3117654321" } },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("NOT_FOUND");
    });

    it("answers 400 when the customer id is not a UUID", async () => {
      const response = await patchCustomer(
        "not-a-uuid",
        { person: { phone: "3117654321" } },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });
  });

  describe("role access", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "allows %s to update customer data",
      async (roleName) => {
        const customerId = await createCustomer();

        const response = await patchCustomer(
          customerId,
          { person: { phone: "3117654321" } },
          tokens[roleName],
        ).expect(200);

        expect(customerOf(response.body).person.phone).toBe("3117654321");
      },
    );

    it("rejects DEV with 403 and does not change the customer", async () => {
      const customerId = await createCustomer();
      const before = await findCustomer(customerId);

      const response = await patchCustomer(
        customerId,
        { person: { phone: "3117654321" } },
        tokens.DEV,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(await findCustomer(customerId)).toEqual(before);
    });

    it("rejects requests without an access token", async () => {
      const customerId = await createCustomer();

      await patchCustomer(customerId, {
        person: { phone: "3117654321" },
      }).expect(401);

      expect((await findCustomer(customerId)).person.phone).toBe("3004445566");
    });
  });
});
