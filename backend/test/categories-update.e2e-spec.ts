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

interface CategoryResponse {
  data: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
  };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-CAT-${runId}`;
const categoryName = (label: string) => `${runId} ${label}`;
const categoryOf = (body: unknown) => (body as CategoryResponse).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

describe("PATCH /api/v1/categories/:categoryId (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];
  const categoryIds: string[] = [];

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const patchCategory = (categoryId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/categories/${categoryId}`,
    );
    if (token) pending.auth(token, { type: "bearer" });
    return pending.send(body);
  };

  const patchCategoryStatus = (
    categoryId: string,
    body: object,
    token?: string,
  ) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/categories/${categoryId}/status`,
    );
    if (token) pending.auth(token, { type: "bearer" });
    return pending.send(body);
  };

  const createCategory = async (label: string, active = true) => {
    const category = await prisma.category.create({
      data: {
        name: categoryName(label),
        description: `Descripción inicial ${label}`,
        active,
      },
    });
    categoryIds.push(category.id);
    return category;
  };

  const getCategory = (categoryId: string) =>
    prisma.category.findUniqueOrThrow({ where: { id: categoryId } });

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
          name: "Cédula (e2e actualizar categoría)",
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
          email: `${roleName.toLowerCase()}.categories.update.${runId}@e2e.test`,
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
        OR: [{ userId: { in: actorIds } }, { entityId: { in: categoryIds } }],
      },
    });
    await prisma.category.deleteMany({
      where: { id: { in: categoryIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: actorIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: actorIds } } });
    await prisma.documentType.deleteMany({
      where: { code: DOCUMENT_CODE },
    });
    await app.close();
  }, 30000);

  describe("category editing", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER"])(
      "allows %s to edit category fields and records the audit log",
      async (roleName) => {
        const category = await createCategory(`Edición ${roleName}`);
        const name = categoryName(`Actualizada ${roleName}`);
        const description = `Descripción actualizada por ${roleName}`;

        const response = await patchCategory(
          category.id,
          { name, description },
          tokens[roleName],
        ).expect(200);

        expect(categoryOf(response.body)).toMatchObject({
          id: category.id,
          name,
          description,
          active: true,
        });
        expect(await getCategory(category.id)).toMatchObject({
          name,
          description,
          active: true,
        });

        const auditLog = await prisma.auditLog.findFirst({
          where: {
            entity: "CATEGORY",
            entityId: category.id,
            action: "UPDATE",
          },
        });
        expect(auditLog).toMatchObject({
          userId: expect.any(String),
          action: "UPDATE",
          entity: "CATEGORY",
          entityId: category.id,
          oldData: {
            name: category.name,
            description: category.description,
            active: true,
          },
          newData: {
            name,
            description,
            active: true,
          },
        });
      },
    );

    it.each<RoleName>(["BRANCH_ASSISTANT", "DEV"])(
      "rejects %s from editing a category",
      async (roleName) => {
        const category = await createCategory(`Edición denegada ${roleName}`);

        const response = await patchCategory(
          category.id,
          { name: categoryName(`No autorizada ${roleName}`) },
          tokens[roleName],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect(await getCategory(category.id)).toMatchObject({
          name: category.name,
          description: category.description,
          active: true,
        });
      },
    );

    it("rejects an empty update and leaves the category unchanged", async () => {
      const category = await createCategory("Edición vacía");

      const response = await patchCategory(
        category.id,
        {},
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
      expect(await getCategory(category.id)).toMatchObject({
        name: category.name,
        description: category.description,
      });
    });

    it("rejects invalid field values and leaves the category unchanged", async () => {
      const category = await createCategory("Edición inválida");

      const response = await patchCategory(
        category.id,
        { name: "ab" },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
      expect(await getCategory(category.id)).toMatchObject({
        name: category.name,
        description: category.description,
      });
    });

    it("answers 409 when the updated name already exists", async () => {
      const category = await createCategory("Nombre por cambiar");
      const existing = await createCategory("Nombre duplicado");

      await patchCategory(
        category.id,
        { name: existing.name, description: "Intento duplicado" },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(await getCategory(category.id)).toMatchObject({
        name: category.name,
        description: category.description,
      });
    });

    it("answers 404 when the category does not exist", async () => {
      await patchCategory(
        randomUUID(),
        { name: categoryName("No existe") },
        tokens.SUPERADMIN,
      ).expect(404);
    });
  });

  describe("category status", () => {
    it("allows SUPERADMIN to deactivate and reactivate a category", async () => {
      const category = await createCategory("Cambio estado");

      const deactivationResponse = await patchCategoryStatus(
        category.id,
        { active: false },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(deactivationResponse.body).toEqual({
        data: { message: "Category status updated successfully." },
      });
      expect((await getCategory(category.id)).active).toBe(false);

      const reactivationResponse = await patchCategoryStatus(
        category.id,
        { active: true },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(reactivationResponse.body).toEqual({
        data: { message: "Category status updated successfully." },
      });
      expect((await getCategory(category.id)).active).toBe(true);

      const auditLogs = await prisma.auditLog.findMany({
        where: { entity: "CATEGORY", entityId: category.id },
        orderBy: { createdAt: "asc" },
      });
      expect(auditLogs).toHaveLength(2);
      expect(auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "DEACTIVATE",
            oldData: { active: true },
            newData: { active: false },
          }),
          expect.objectContaining({
            action: "ACTIVATE",
            oldData: { active: false },
            newData: { active: true },
          }),
        ]),
      );
    });

    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
      "rejects %s from changing category status",
      async (roleName) => {
        const category = await createCategory(`Estado denegado ${roleName}`);

        const response = await patchCategoryStatus(
          category.id,
          { active: false },
          tokens[roleName],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect((await getCategory(category.id)).active).toBe(true);
      },
    );

    it("rejects requests without an access token", async () => {
      const category = await createCategory("Estado sin token");

      await patchCategoryStatus(category.id, { active: false }).expect(401);

      expect((await getCategory(category.id)).active).toBe(true);
    });

    it("rejects invalid status values without changing the category", async () => {
      const category = await createCategory("Estado inválido");

      const response = await patchCategoryStatus(
        category.id,
        { active: "false" },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
      expect((await getCategory(category.id)).active).toBe(true);
    });

    it("answers 409 when the category is already in the requested state", async () => {
      const category = await createCategory("Estado existente");

      const response = await patchCategoryStatus(
        category.id,
        { active: true },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "ALREADY_IN_STATE",
        message: "Category is already in the requested state.",
      });
      expect((await getCategory(category.id)).active).toBe(true);
      expect(
        await prisma.auditLog.count({
          where: { entity: "CATEGORY", entityId: category.id },
        }),
      ).toBe(0);
    });
  });
});
