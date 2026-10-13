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

describe("POST /api/v1/categories (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const postCategory = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/categories");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const categoryCount = (name: string) =>
    prisma.category.count({ where: { name } });

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
          name: "Cédula (e2e crear categoría)",
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
          email: `${roleName.toLowerCase()}.categories.create.${runId}@e2e.test`,
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
    const createdCategories = await prisma.category.findMany({
      where: { name: { startsWith: runId } },
      select: { id: true },
    });
    const categoryIds = createdCategories.map(({ id }) => id);

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

  describe("creation", () => {
    it("creates the category and records the audit log", async () => {
      const name = categoryName("Proteínas");
      const description = "Suplementos de proteína";

      const response = await postCategory(
        { name, description },
        tokens.SUPERADMIN,
      ).expect(201);

      const category = categoryOf(response.body);
      expect(category).toMatchObject({
        id: expect.any(String),
        name,
        description,
        active: true,
      });
      expect(await categoryCount(name)).toBe(1);

      const auditLog = await prisma.auditLog.findFirst({
        where: { entity: "CATEGORY", entityId: category.id, action: "CREATE" },
      });
      expect(auditLog).toMatchObject({
        userId: actorIds[0],
        action: "CREATE",
        entity: "CATEGORY",
        entityId: category.id,
        newData: { name, description, active: true },
      });
    });
  });

  describe("required fields", () => {
    const missingFields: Array<[string, Record<string, unknown>]> = [
      ["name", { description: "Categoría sin nombre" }],
      ["description", { name: categoryName("Sin descripción") }],
    ];

    it.each(missingFields)(
      "rejects a request missing %s",
      async (field, payload) => {
        const response = await postCategory(payload, tokens.SUPERADMIN).expect(
          400,
        );

        expect(errorOf(response.body)).toMatchObject({
          code: "BAD_REQUEST",
          message: "Request validation failed.",
        });
        expect(errorOf(response.body).details).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
        if (typeof payload.name === "string") {
          expect(await categoryCount(payload.name)).toBe(0);
        }
      },
    );
  });

  describe("duplicate name", () => {
    it("answers 409 when a category with the same name already exists", async () => {
      const name = categoryName("Duplicada");
      await prisma.category.create({
        data: { name, description: "Categoría existente" },
      });

      const response = await postCategory(
        { name, description: "Intento duplicado" },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "CATEGORY_NAME_ALREADY_EXISTS",
        message: "Category with this name already exists",
      });
      expect(await categoryCount(name)).toBe(1);
    });
  });

  describe("role access", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER", "DEV"])(
      "allows %s to create a category",
      async (roleName) => {
        const name = categoryName(`Permitida ${roleName}`);

        const response = await postCategory(
          { name, description: "Creada por un rol autorizado" },
          tokens[roleName],
        ).expect(201);

        expect(categoryOf(response.body)).toMatchObject({
          name,
          description: "Creada por un rol autorizado",
        });
        expect(await categoryCount(name)).toBe(1);
      },
    );

    it("rejects BRANCH_ASSISTANT with 403 without creating a category", async () => {
      const name = categoryName("No autorizada");

      const response = await postCategory(
        { name, description: "No debe guardarse" },
        tokens.BRANCH_ASSISTANT,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(await categoryCount(name)).toBe(0);
    });

    it("rejects requests without an access token", async () => {
      const name = categoryName("Sin token");

      await postCategory({ name, description: "No debe guardarse" }).expect(
        401,
      );

      expect(await categoryCount(name)).toBe(0);
    });
  });
});
