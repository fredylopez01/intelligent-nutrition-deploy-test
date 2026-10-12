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

interface CustomerBody {
  id: string;
  personId: string;
  fullName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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
    documentType: { code: string; name: string };
  };
}

interface InvalidCase {
  label: string;
  payload: () => Record<string, unknown>;
  field?: string;
  message?: string;
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = "CC-CUST-CREATE-E2E";
const INACTIVE_DOCUMENT_CODE = "XX-CUST-CREATE-E2E";

const customerOf = (body: unknown) => (body as { data: CustomerBody }).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;
const without = (source: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));

describe("POST /api/v1/customers (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let inactiveDocumentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;
  const roleIds = {} as Record<RoleName, string>;

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };
  const nextEmail = (label = "cliente") => {
    sequence += 1;
    return `${label}.${runId}.${sequence}@e2e.test`;
  };

  const postCustomer = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/customers");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const personPayload = (overrides: Record<string, unknown> = {}) => ({
    documentTypeId,
    documentNumber: nextDocument(),
    firstName: "Carlos",
    lastName: "Gómez",
    email: nextEmail(),
    phone: "3001112233",
    address: "Calle 20 # 10-15",
    ...overrides,
  });

  const createPerson = async (
    overrides: { email?: string; active?: boolean } = {},
  ) => {
    const documentNumber = nextDocument();
    const person = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber,
        firstName: "Marta",
        lastName: "Rojas",
        email: overrides.email ?? nextEmail("persona"),
        phone: "3004445566",
        address: "Carrera 7 # 6-5",
        active: overrides.active ?? true,
      },
    });
    return { id: person.id, documentNumber };
  };

  const createUserPerson = () =>
    prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: nextDocument(),
        firstName: "Lucia",
        lastName: "Usuaria",
        email: nextEmail("usuaria"),
        phone: "3006667788",
        address: "Avenida 1 # 2-3",
        userAccount: {
          create: {
            roleId: roleIds.BRANCH_ASSISTANT,
            active: true,
            mustChangePassword: false,
          },
        },
      },
    });

  const customerCount = (personId: string) =>
    prisma.customer.count({ where: { personId } });
  const personCount = (documentNumber: string) =>
    prisma.person.count({ where: { documentTypeId, documentNumber } });
  const createLogs = (entityId: string) =>
    prisma.auditLog.findMany({
      where: { entity: "CUSTOMER", entityId, action: "CREATE" },
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
        create: { code: DOCUMENT_CODE, name: "Cédula (e2e crear cliente)" },
      })
    ).id;
    inactiveDocumentTypeId = (
      await prisma.documentType.upsert({
        where: { code: INACTIVE_DOCUMENT_CODE },
        update: { active: false },
        create: {
          code: INACTIVE_DOCUMENT_CODE,
          name: "Tipo inactivo (e2e crear cliente)",
          active: false,
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
      roleIds[roleName] = role.id;
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: nextDocument(),
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.create.${runId}@e2e.test`,
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
    const people = await prisma.person.findMany({
      where: {
        documentTypeId: { in: [documentTypeId, inactiveDocumentTypeId] },
      },
      select: { id: true },
    });
    const personIds = people.map(({ id }) => id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { userId: { in: Object.values(actorIds) } },
          { entityId: { in: personIds } },
        ],
      },
    });
    await prisma.customer.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.documentType.deleteMany({
      where: { code: { in: [DOCUMENT_CODE, INACTIVE_DOCUMENT_CODE] } },
    });
    await app.close();
  }, 30000);

  describe("successful registration", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "lets %s register a customer from a new person and audits it",
      async (roleName) => {
        const payload = personPayload();

        const response = await postCustomer(
          { person: payload },
          tokens[roleName],
        ).expect(201);

        const customer = customerOf(response.body);
        expect(customer).toMatchObject({
          id: expect.any(String),
          fullName: "Carlos Gómez",
          active: true,
          person: {
            documentTypeId,
            documentNumber: payload.documentNumber,
            firstName: "Carlos",
            lastName: "Gómez",
            email: payload.email,
            phone: payload.phone,
            address: payload.address,
            active: true,
            documentType: { code: DOCUMENT_CODE },
          },
        });
        expect(customer.id).toBe(customer.personId);

        const stored = await prisma.customer.findUniqueOrThrow({
          where: { personId: customer.id },
        });
        expect(stored).toMatchObject({
          fullName: "Carlos Gómez",
          active: true,
        });
        expect(await personCount(payload.documentNumber)).toBe(1);

        const logs = await createLogs(customer.id);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          userId: actorIds[roleName],
          action: "CREATE",
          entity: "CUSTOMER",
          newData: expect.objectContaining({
            personId: customer.id,
            fullName: "Carlos Gómez",
          }),
        });
      },
    );

    it("uses the business name as full name for a company", async () => {
      const payload = personPayload({
        businessName: "Nutrición Total SAS",
        firstName: undefined,
        lastName: undefined,
      });

      const response = await postCustomer(
        { person: payload },
        tokens.BRANCH_LEADER,
      ).expect(201);

      const customer = customerOf(response.body);
      expect(customer.fullName).toBe("Nutrición Total SAS");
      expect(customer.person.businessName).toBe("Nutrición Total SAS");
      expect(customer.person.firstName).toBeNull();
    });

    it("stores the email in lowercase", async () => {
      const email = nextEmail("MixedCase");

      const response = await postCustomer(
        { person: personPayload({ email: email.toUpperCase() }) },
        tokens.SUPERADMIN,
      ).expect(201);

      expect(customerOf(response.body).person.email).toBe(email.toLowerCase());
    });
  });

  describe("person reuse", () => {
    it("reuses the person registered for the document without duplicating it", async () => {
      const existing = await createPerson();

      const response = await postCustomer(
        {
          person: personPayload({
            documentNumber: existing.documentNumber,
            firstName: "Otro",
            lastName: "Nombre",
            email: nextEmail("otro"),
          }),
        },
        tokens.BRANCH_ASSISTANT,
      ).expect(201);

      const customer = customerOf(response.body);
      expect(customer.id).toBe(existing.id);
      expect(customer.fullName).toBe("Marta Rojas");
      expect(await personCount(existing.documentNumber)).toBe(1);
      expect(await customerCount(existing.id)).toBe(1);
    });

    it("creates the customer from an existing personId", async () => {
      const existing = await createPerson();

      const response = await postCustomer(
        { personId: existing.id },
        tokens.BRANCH_LEADER,
      ).expect(201);

      const customer = customerOf(response.body);
      expect(customer).toMatchObject({
        id: existing.id,
        fullName: "Marta Rojas",
        active: true,
      });
      expect(await personCount(existing.documentNumber)).toBe(1);
      expect(await createLogs(existing.id)).toHaveLength(1);
    });

    it("keeps the user account when the person is also a user", async () => {
      const userPerson = await createUserPerson();

      await postCustomer({ personId: userPerson.id }, tokens.SUPERADMIN).expect(
        201,
      );

      expect(await customerCount(userPerson.id)).toBe(1);
      const account = await prisma.userAccount.findUniqueOrThrow({
        where: { personId: userPerson.id },
      });
      expect(account).toMatchObject({
        roleId: roleIds.BRANCH_ASSISTANT,
        active: true,
      });
    });
  });

  describe("duplicated customers", () => {
    it("answers 409 ALREADY_CUSTOMER when the document is already a customer", async () => {
      const existing = await createPerson();
      await prisma.customer.create({
        data: { personId: existing.id, fullName: "Marta Rojas" },
      });

      const response = await postCustomer(
        { person: personPayload({ documentNumber: existing.documentNumber }) },
        tokens.BRANCH_LEADER,
      ).expect(409);

      expect(errorOf(response.body).code).toBe("ALREADY_CUSTOMER");
      expect(await customerCount(existing.id)).toBe(1);
      expect(await createLogs(existing.id)).toHaveLength(0);
    });

    it("answers 409 ALREADY_CUSTOMER when the personId is already a customer", async () => {
      const existing = await createPerson();
      await prisma.customer.create({
        data: { personId: existing.id, fullName: "Marta Rojas" },
      });

      const response = await postCustomer(
        { personId: existing.id },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body).code).toBe("ALREADY_CUSTOMER");
      expect(await customerCount(existing.id)).toBe(1);
    });
  });

  describe("validation", () => {
    const invalidCases: InvalidCase[] = [
      {
        label: "documentTypeId is missing",
        payload: () => ({ person: without(personPayload(), "documentTypeId") }),
        field: "documentTypeId",
      },
      {
        label: "documentTypeId is not a UUID",
        payload: () => ({
          person: personPayload({ documentTypeId: "no-es-un-uuid" }),
        }),
        field: "documentTypeId",
      },
      {
        label: "documentNumber is missing",
        payload: () => ({ person: without(personPayload(), "documentNumber") }),
        field: "documentNumber",
      },
      {
        label: "documentNumber is empty",
        payload: () => ({ person: personPayload({ documentNumber: "" }) }),
        field: "documentNumber",
      },
      {
        label: "email is missing",
        payload: () => ({ person: without(personPayload(), "email") }),
        field: "email",
      },
      {
        label: "email has an invalid format",
        payload: () => ({ person: personPayload({ email: "no-es-correo" }) }),
        field: "email",
      },
      {
        label: "phone is missing",
        payload: () => ({ person: without(personPayload(), "phone") }),
        field: "phone",
      },
      {
        label: "address is missing",
        payload: () => ({ person: without(personPayload(), "address") }),
        field: "address",
      },
      {
        label: "personId is not a UUID",
        payload: () => ({ personId: "no-es-un-uuid" }),
        field: "personId",
      },
      {
        label: "an unknown field is sent in the body",
        payload: () => ({ person: personPayload(), active: false }),
        field: "active",
      },
      {
        label: "an unknown field is sent in the person block",
        payload: () => ({ person: personPayload({ role: "SUPERADMIN" }) }),
        field: "role",
      },
      {
        label: "neither names nor business name are sent",
        payload: () => ({
          person: personPayload({ firstName: undefined, lastName: undefined }),
        }),
        message: "Provide businessName or both firstName and lastName",
      },
      {
        label: "only the first name is sent",
        payload: () => ({ person: personPayload({ lastName: undefined }) }),
        message: "Provide businessName or both firstName and lastName",
      },
      {
        label: "a business name is combined with only a last name",
        payload: () => ({
          person: personPayload({
            businessName: "Nutrición Total SAS",
            firstName: undefined,
          }),
        }),
        message: "firstName and lastName must be provided together",
      },
      {
        label: "both person and personId are sent",
        payload: () => ({ person: personPayload(), personId: randomUUID() }),
        message: "Provide either person or personId, but not both",
      },
      {
        label: "neither person nor personId is sent",
        payload: () => ({}),
        message: "Provide either person or personId, but not both",
      },
    ];

    it.each(invalidCases)(
      "answers 400 when $label and creates nothing",
      async ({ payload, field, message }) => {
        const body = payload();
        const documentNumber = (body.person as { documentNumber?: unknown })
          ?.documentNumber;

        const response = await postCustomer(body, tokens.BRANCH_LEADER).expect(
          400,
        );

        const error = errorOf(response.body);
        if (field) {
          expect(error.details).toEqual(
            expect.arrayContaining([expect.stringContaining(field)]),
          );
        }
        if (message) {
          expect(error.message).toBe(message);
        }
        if (typeof documentNumber === "string" && documentNumber !== "") {
          expect(await personCount(documentNumber)).toBe(0);
        }
      },
    );
  });

  describe("business rules", () => {
    it.each([
      ["unknown", () => randomUUID()],
      ["inactive", () => inactiveDocumentTypeId],
    ])(
      "answers 404 when the document type is %s",
      async (_label, resolveDocumentTypeId) => {
        const payload = personPayload({
          documentTypeId: resolveDocumentTypeId(),
        });

        const response = await postCustomer(
          { person: payload },
          tokens.BRANCH_LEADER,
        ).expect(404);

        expect(errorOf(response.body).message).toBe(
          "Active document type not found",
        );
        expect(await personCount(payload.documentNumber)).toBe(0);
      },
    );

    it("answers 404 when the personId does not exist", async () => {
      await postCustomer(
        { personId: randomUUID() },
        tokens.BRANCH_LEADER,
      ).expect(404);
    });

    it("answers 404 when the person is inactive", async () => {
      const inactive = await createPerson({ active: false });

      await postCustomer(
        { personId: inactive.id },
        tokens.BRANCH_LEADER,
      ).expect(404);

      expect(await customerCount(inactive.id)).toBe(0);
    });

    it("answers 404 when the document belongs to an inactive person", async () => {
      const inactive = await createPerson({ active: false });

      await postCustomer(
        { person: personPayload({ documentNumber: inactive.documentNumber }) },
        tokens.BRANCH_LEADER,
      ).expect(404);

      expect(await customerCount(inactive.id)).toBe(0);
    });

    it("answers 409 EMAIL_ALREADY_IN_USE when the email belongs to another person", async () => {
      const email = nextEmail("duplicado");
      await createPerson({ email });
      const payload = personPayload({ email: email.toUpperCase() });

      const response = await postCustomer(
        { person: payload },
        tokens.BRANCH_LEADER,
      ).expect(409);

      expect(errorOf(response.body).code).toBe("EMAIL_ALREADY_IN_USE");
      expect(await personCount(payload.documentNumber)).toBe(0);
    });
  });

  describe("access control", () => {
    it("rejects DEV with 403 and creates nothing", async () => {
      const payload = personPayload();

      const response = await postCustomer(
        { person: payload },
        tokens.DEV,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(await personCount(payload.documentNumber)).toBe(0);
    });

    it("rejects a request without token with 401", async () => {
      const payload = personPayload();

      await postCustomer({ person: payload }).expect(401);

      expect(await personCount(payload.documentNumber)).toBe(0);
    });

    it("rejects an invalid token with 401", async () => {
      const payload = personPayload();

      await postCustomer({ person: payload }, "not-a-valid-token").expect(401);

      expect(await personCount(payload.documentNumber)).toBe(0);
    });
  });
});
