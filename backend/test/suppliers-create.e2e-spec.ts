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

interface SupplierBody {
  id: string;
  commercialName: string;
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
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `SUP-CREATE-${runId}`;
const supplierOf = (body: unknown) => (body as { data: SupplierBody }).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

describe("POST /api/v1/suppliers (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;
  const roleIds = {} as Record<RoleName, string>;

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };
  const nextEmail = (label = "proveedor") => {
    sequence += 1;
    return `${label}.${runId}.${sequence}@e2e.test`;
  };

  const postSupplier = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/suppliers");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const personPayload = (overrides: Record<string, unknown> = {}) => ({
    documentTypeId,
    documentNumber: nextDocument(),
    firstName: "Carolina",
    lastName: "Gómez",
    email: nextEmail(),
    phone: "3001112233",
    address: "Calle 20 # 10-15",
    ...overrides,
  });

  const createUserPerson = () =>
    prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: nextDocument(),
        firstName: "Lucía",
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

  const supplierCount = (personId: string) =>
    prisma.supplier.count({ where: { personId } });
  const personCount = (documentNumber: string) =>
    prisma.person.count({ where: { documentTypeId, documentNumber } });
  const createLogs = (entityId: string) =>
    prisma.auditLog.findMany({
      where: { entity: "SUPPLIER", entityId, action: "CREATE" },
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
          name: "Documento (e2e crear proveedor)",
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
          email: `${roleName.toLowerCase()}.suppliers.create.${runId}@e2e.test`,
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
      where: { documentTypeId },
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
    await prisma.supplier.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });
    await app.close();
  }, 30000);

  describe("successful registration", () => {
    it("registers a natural person and records the supplier", async () => {
      const payload = personPayload();

      const response = await postSupplier(
        { person: payload, commercialName: "Distribuciones Carolina" },
        tokens.SUPERADMIN,
      ).expect(201);

      const supplier = supplierOf(response.body);
      expect(supplier).toMatchObject({
        id: expect.any(String),
        commercialName: "Distribuciones Carolina",
        person: {
          documentTypeId,
          documentNumber: payload.documentNumber,
          firstName: "Carolina",
          lastName: "Gómez",
          businessName: null,
          email: payload.email,
          phone: payload.phone,
          address: payload.address,
          active: true,
        },
      });
      expect(supplier.id).toBe(supplier.person.id);
      expect(await personCount(payload.documentNumber)).toBe(1);
      expect(await supplierCount(supplier.id)).toBe(1);

      const logs = await createLogs(supplier.id);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        userId: actorIds.SUPERADMIN,
        action: "CREATE",
        entity: "SUPPLIER",
      });
    });

    it("registers an existing user by personId without removing its account", async () => {
      const user = await createUserPerson();

      const response = await postSupplier(
        { personId: user.id, commercialName: "Proveedor de Lucía" },
        tokens.BRANCH_LEADER,
      ).expect(201);

      expect(supplierOf(response.body)).toMatchObject({
        id: user.id,
        commercialName: "Proveedor de Lucía",
        person: { id: user.id, firstName: "Lucía", lastName: "Usuaria" },
      });
      expect(await supplierCount(user.id)).toBe(1);
      await expect(
        prisma.userAccount.findUniqueOrThrow({ where: { personId: user.id } }),
      ).resolves.toMatchObject({
        roleId: roleIds.BRANCH_ASSISTANT,
        active: true,
      });
    });
  });

  describe("duplicate registration", () => {
    it("answers 409 ALREADY_SUPPLIER for a repeated person and personId", async () => {
      const payload = personPayload();
      const initialResponse = await postSupplier(
        { person: payload, commercialName: "Proveedor Único" },
        tokens.SUPERADMIN,
      ).expect(201);
      const created = supplierOf(initialResponse.body);

      const repeatedPerson = await postSupplier(
        {
          person: { ...payload, email: nextEmail("duplicado") },
          commercialName: "Otro nombre comercial",
        },
        tokens.BRANCH_LEADER,
      ).expect(409);
      expect(errorOf(repeatedPerson.body).code).toBe("ALREADY_SUPPLIER");

      const repeatedPersonId = await postSupplier(
        { personId: created.id, commercialName: "Otro nombre comercial" },
        tokens.DEV,
      ).expect(409);
      expect(errorOf(repeatedPersonId.body).code).toBe("ALREADY_SUPPLIER");

      expect(await personCount(payload.documentNumber)).toBe(1);
      expect(await supplierCount(created.id)).toBe(1);
      expect(await createLogs(created.id)).toHaveLength(1);
    });
  });

  describe("role access", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER", "DEV"])(
      "allows %s to register a supplier",
      async (roleName) => {
        const payload = personPayload();

        const response = await postSupplier(
          { person: payload, commercialName: `Proveedor ${roleName}` },
          tokens[roleName],
        ).expect(201);

        const supplier = supplierOf(response.body);
        expect(supplier.person.documentNumber).toBe(payload.documentNumber);
        expect(await supplierCount(supplier.id)).toBe(1);
      },
    );

    it("rejects BRANCH_ASSISTANT with 403 without creating the person", async () => {
      const payload = personPayload();

      const response = await postSupplier(
        { person: payload, commercialName: "Proveedor no autorizado" },
        tokens.BRANCH_ASSISTANT,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(await personCount(payload.documentNumber)).toBe(0);
    });

    it("rejects a request without a token with 401", async () => {
      await postSupplier({
        person: personPayload(),
        commercialName: "Proveedor sin token",
      }).expect(401);
    });
  });
});
