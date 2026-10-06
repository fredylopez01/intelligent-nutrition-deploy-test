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

interface UpdateResponse {
  data: {
    id: string;
    person: {
      businessName: string | null;
      documentNumber: string | null;
      phone: string | null;
      address: string | null;
      active: boolean;
    };
    commercialName: string | null;
  };
}

const runId = Date.now().toString(36);

describe("PATCH /api/v1/suppliers/:supplierId (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const tokens = {} as Record<RoleName, string>;
  const personIds: string[] = [];
  const userIds: string[] = [];
  let supplierId: string;

  const patchSupplier = (
    id: string,
    body: object,
    token: string = tokens.SUPERADMIN,
  ) => {
    const pending = request(app.getHttpServer())
      .patch(`/api/v1/suppliers/${id}`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const findSupplier = (id: string) =>
    prisma.supplier.findUnique({
      where: { personId: id },
      select: {
        commercialName: true,
        person: {
          select: {
            businessName: true,
            documentNumber: true,
            phone: true,
            address: true,
            active: true,
          },
        },
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

    const documentType = await prisma.documentType.upsert({
      where: { code: "NIT-E2E" },
      update: { active: true },
      create: { code: "NIT-E2E", name: "NIT (e2e)" },
    });

    const supplierPerson = await prisma.person.create({
      data: {
        businessName: `${runId} Suplementos Andinos SAS`,
        documentTypeId: documentType.id,
        documentNumber: `900${runId}111`,
        email: `contacto.${runId}@e2e.test`,
        phone: "6017000000",
        address: "Calle 1 # 2-3",
        supplier: {
          create: { commercialName: `${runId} Suplementos Andinos` },
        },
      },
    });
    supplierId = supplierPerson.id;
    personIds.push(supplierPerson.id);

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
          email: `${roleName.toLowerCase()}.update.${runId}@e2e.test`,
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
    await prisma.auditLog.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.supplier.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: personIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.documentType.deleteMany({ where: { code: "NIT-E2E" } });
    await app.close();
  }, 30000);

  describe("successful update", () => {
    it("updates the commercial name, phone and address together", async () => {
      const response = await patchSupplier(supplierId, {
        commercialName: `${runId} Suplementos Andinos EDITADO`,
        phone: "3001112233",
        address: "Carrera 9 # 8-7",
      }).expect(200);

      const body = response.body as UpdateResponse;
      expect(body.data.id).toBe(supplierId);
      expect(body.data.commercialName).toBe(
        `${runId} Suplementos Andinos EDITADO`,
      );
      expect(body.data.person).toMatchObject({
        phone: "3001112233",
        address: "Carrera 9 # 8-7",
        documentNumber: `900${runId}111`,
      });

      const stored = await findSupplier(supplierId);
      expect(stored).toMatchObject({
        commercialName: `${runId} Suplementos Andinos EDITADO`,
        person: {
          phone: "3001112233",
          address: "Carrera 9 # 8-7",
          documentNumber: `900${runId}111`,
          active: true,
        },
      });
    });

    it("writes an audit log with the previous and the new values", async () => {
      const auditLog = await prisma.auditLog.findFirst({
        where: { entityId: supplierId, action: "UPDATE", entity: "SUPPLIER" },
        orderBy: { createdAt: "desc" },
      });

      expect(auditLog).toMatchObject({
        action: "UPDATE",
        entity: "SUPPLIER",
        entityId: supplierId,
        userId: userIds[0],
        oldData: {
          commercialName: `${runId} Suplementos Andinos`,
          person: { phone: "6017000000", address: "Calle 1 # 2-3" },
        },
        newData: {
          commercialName: `${runId} Suplementos Andinos EDITADO`,
          person: { phone: "3001112233", address: "Carrera 9 # 8-7" },
        },
      });
      expect(auditLog?.reason).toContain("Suplementos Andinos EDITADO");
    });

    it("keeps the untouched fields when only the commercial name changes", async () => {
      const response = await patchSupplier(supplierId, {
        commercialName: `${runId} Suplementos Parcial`,
      }).expect(200);

      const body = response.body as UpdateResponse;
      expect(body.data.commercialName).toBe(`${runId} Suplementos Parcial`);
      expect(body.data.person).toMatchObject({
        phone: "3001112233",
        address: "Carrera 9 # 8-7",
      });

      const stored = await findSupplier(supplierId);
      expect(stored).toMatchObject({
        person: { phone: "3001112233", address: "Carrera 9 # 8-7" },
      });
    });
  });

  describe("validation", () => {
    it("rejects a phone that is not made of digits", async () => {
      const response = await patchSupplier(supplierId, {
        phone: "300abc",
      }).expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
      const stored = await findSupplier(supplierId);
      expect(stored?.person.phone).toBe("3001112233");
    });

    it("rejects a body that tries to change the email", async () => {
      const response = await patchSupplier(supplierId, {
        email: "nuevo@correo.test",
      }).expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
      const stored = await findSupplier(supplierId);
      expect(stored?.person.businessName).toBe(
        `${runId} Suplementos Andinos SAS`,
      );
    });

    it("rejects a body that tries to change the NIT", async () => {
      const response = await patchSupplier(supplierId, {
        documentNumber: `900${runId}999`,
      }).expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
      const stored = await findSupplier(supplierId);
      expect(stored?.person.documentNumber).toBe(`900${runId}111`);
    });

    it("rejects an empty body", async () => {
      const response = await patchSupplier(supplierId, {}).expect(400);

      expect(response.body).toMatchObject({
        error: {
          code: "BAD_REQUEST",
          message: "At least one field must be provided",
        },
      });
    });

    it("rejects an empty commercial name", async () => {
      const response = await patchSupplier(supplierId, {
        commercialName: "   ",
      }).expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("errors", () => {
    it("answers 404 for a supplier that does not exist", async () => {
      const response = await patchSupplier(
        "00000000-0000-4000-8000-000000000000",
        { commercialName: "No existe" },
      ).expect(404);

      expect(response.body).toMatchObject({
        error: { code: "NOT_FOUND" },
      });
    });

    it("answers 400 for an id that is not a uuid", async () => {
      const response = await patchSupplier("no-es-uuid", {
        commercialName: "Sin id",
      }).expect(400);

      expect(response.body).toMatchObject({ error: { code: "BAD_REQUEST" } });
    });
  });

  describe("access", () => {
    it("rejects requests without an access token", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/suppliers/${supplierId}`)
        .send({ commercialName: "Sin token" })
        .expect(401);
    });

    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER", "DEV"])(
      "allows the %s role to update a supplier",
      async (roleName) => {
        const response = await patchSupplier(
          supplierId,
          { commercialName: `${runId} Rol ${roleName}` },
          tokens[roleName],
        ).expect(200);

        const body = response.body as UpdateResponse;
        expect(body.data.commercialName).toBe(`${runId} Rol ${roleName}`);
      },
    );

    it("denies the update to the BRANCH_ASSISTANT role", async () => {
      const response = await patchSupplier(
        supplierId,
        { commercialName: "No debería pasar" },
        tokens.BRANCH_ASSISTANT,
      ).expect(403);

      expect(response.body).toMatchObject({
        error: { code: "INSUFFICIENT_PERMISSIONS" },
      });
      const stored = await findSupplier(supplierId);
      expect(stored?.commercialName).toBe(`${runId} Rol DEV`);
    });
  });
});
