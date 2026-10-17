import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
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

interface ProductResponse {
  data: {
    id: string;
    name: string;
    referenceCode: string;
    description: string | null;
    categoryId: string;
    unitOfMeasureId: string;
    price: string;
    active: boolean;
    primaryImageUrl: string | null;
    updatedAt: string;
  };
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-PU-${runId}`;
const PRODUCT_REFERENCE_CODE = `PU-${runId}`;
const originalName = `${runId} Original Product`;
const updatedName = `${runId} Updated Product`;
const originalPrice = "12500.00";
const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const errorOf = (body: unknown) => (body as ApiError).error;

describe("PATCH /api/v1/products/:productId (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let documentTypeId = "";
  let categoryId = "";
  let alternateCategoryId = "";
  let inactiveCategoryId = "";
  let unitOfMeasureId = "";
  let alternateUnitOfMeasureId = "";
  let inactiveUnitOfMeasureId = "";
  let productId = "";
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const patchProduct = (
    targetProductId: string,
    body: object,
    token?: string,
  ) => {
    const pending = request(app!.getHttpServer())
      .patch(`/api/v1/products/${targetProductId}`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const database = app.get(PrismaService);
    prisma = database;
    const jwtService = app.get(JwtService);

    documentTypeId = (
      await database.documentType.create({
        data: { code: DOCUMENT_CODE, name: "Document (e2e product update)" },
      })
    ).id;

    for (const [index, roleName] of roleNames.entries()) {
      const role = await database.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await database.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}${index}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.products.update.${runId}@e2e.test`,
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
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const category = await database.category.create({
      data: { name: `${runId} Product Category`, active: true },
    });
    categoryId = category.id;
    const alternateCategory = await database.category.create({
      data: { name: `${runId} Alternate Category`, active: true },
    });
    alternateCategoryId = alternateCategory.id;
    const inactiveCategory = await database.category.create({
      data: { name: `${runId} Inactive Category`, active: false },
    });
    inactiveCategoryId = inactiveCategory.id;

    const unitOfMeasure = await database.unitMeasure.create({
      data: {
        name: `${runId} Product Unit`,
        abreviation: `PU${runId.slice(-7)}`,
        active: true,
      },
    });
    unitOfMeasureId = unitOfMeasure.id;
    const alternateUnitOfMeasure = await database.unitMeasure.create({
      data: {
        name: `${runId} Alternate Unit`,
        abreviation: `AU${runId.slice(-7)}`,
        active: true,
      },
    });
    alternateUnitOfMeasureId = alternateUnitOfMeasure.id;
    const inactiveUnitOfMeasure = await database.unitMeasure.create({
      data: {
        name: `${runId} Inactive Unit`,
        abreviation: `IU${runId.slice(-7)}`,
        active: false,
      },
    });
    inactiveUnitOfMeasureId = inactiveUnitOfMeasure.id;

    const product = await database.product.create({
      data: {
        name: originalName,
        referenceCode: PRODUCT_REFERENCE_CODE,
        description: "Original description",
        categoryId,
        unitOfMeasureId,
        price: originalPrice,
        active: true,
      },
    });
    productId = product.id;
  }, 30000);

  beforeEach(async () => {
    if (!prisma) throw new Error("The test database was not initialized.");

    await prisma.auditLog.deleteMany({ where: { entityId: productId } });
    await prisma.product.update({
      where: { id: productId },
      data: {
        name: originalName,
        description: "Original description",
        categoryId,
        unitOfMeasureId,
        price: originalPrice,
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.auditLog.deleteMany({
          where: {
            OR: [{ entityId: productId }, { userId: { in: personIds } }],
          },
        });
        await prisma.product.deleteMany({
          where: { id: { in: [productId].filter(Boolean) } },
        });
        await prisma.category.deleteMany({
          where: {
            id: {
              in: [categoryId, alternateCategoryId, inactiveCategoryId].filter(
                Boolean,
              ),
            },
          },
        });
        await prisma.unitMeasure.deleteMany({
          where: {
            id: {
              in: [
                unitOfMeasureId,
                alternateUnitOfMeasureId,
                inactiveUnitOfMeasureId,
              ].filter(Boolean),
            },
          },
        });
        await prisma.userAccount.deleteMany({
          where: { personId: { in: personIds } },
        });
        await prisma.person.deleteMany({ where: { id: { in: personIds } } });
        await prisma.documentType.deleteMany({
          where: { id: documentTypeId },
        });
      }
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("successful updates", () => {
    it("updates every editable field and preserves the reference code", async () => {
      const response = await patchProduct(
        productId,
        {
          name: updatedName,
          description: "Updated description",
          categoryId: alternateCategoryId,
          unitOfMeasureId: alternateUnitOfMeasureId,
          price: "15000.5",
        },
        tokens.SUPERADMIN,
      ).expect(200);

      expect((response.body as ProductResponse).data).toMatchObject({
        id: productId,
        name: updatedName,
        referenceCode: PRODUCT_REFERENCE_CODE,
        description: "Updated description",
        categoryId: alternateCategoryId,
        unitOfMeasureId: alternateUnitOfMeasureId,
        price: "15000.50",
        active: true,
        primaryImageUrl: null,
        updatedAt: expect.any(String),
      });

      const savedProduct = await prisma!.product.findUniqueOrThrow({
        where: { id: productId },
      });
      expect(savedProduct.referenceCode).toBe(PRODUCT_REFERENCE_CODE);
    });
  });

  describe("validation", () => {
    it("rejects an empty update", async () => {
      const response = await patchProduct(
        productId,
        {},
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("NO_FIELDS_TO_UPDATE");
    });

    it("rejects referenceCode because it cannot be edited", async () => {
      const response = await patchProduct(
        productId,
        { referenceCode: `NEW-${runId}` },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        code: "FIELD_NOT_EDITABLE",
        details: { field: "referenceCode" },
      });
    });

    it.each([
      ["empty name", { name: "" }],
      ["name longer than 150 characters", { name: "x".repeat(151) }],
      ["malformed category UUID", { categoryId: "not-a-uuid" }],
      ["malformed unit UUID", { unitOfMeasureId: "not-a-uuid" }],
      ["invalid price", { price: "12.345" }],
      ["negative price", { price: "-1.00" }],
      ["unknown field", { active: false }],
    ])("rejects %s", async (_label, body) => {
      const response = await patchProduct(
        productId,
        body,
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a category that does not exist", async () => {
      const response = await patchProduct(
        productId,
        { categoryId: randomUUID() },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("CATEGORY_NOT_FOUND");
    });

    it("rejects an inactive category", async () => {
      const response = await patchProduct(
        productId,
        { categoryId: inactiveCategoryId },
        tokens.SUPERADMIN,
      ).expect(422);

      expect(errorOf(response.body).code).toBe("CATEGORY_INACTIVE");
    });

    it("rejects a unit of measure that does not exist", async () => {
      const response = await patchProduct(
        productId,
        { unitOfMeasureId: randomUUID() },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("UNIT_NOT_FOUND");
    });

    it("rejects an inactive unit of measure", async () => {
      const response = await patchProduct(
        productId,
        { unitOfMeasureId: inactiveUnitOfMeasureId },
        tokens.SUPERADMIN,
      ).expect(422);

      expect(errorOf(response.body).code).toBe("UNIT_INACTIVE");
    });
  });

  describe("not found", () => {
    it("returns 404 when the product does not exist", async () => {
      const response = await patchProduct(
        randomUUID(),
        { name: updatedName },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
    });
  });

  describe("price audit", () => {
    it("records the old and new prices with the automatic reason", async () => {
      await patchProduct(
        productId,
        { price: "15000.50" },
        tokens.SUPERADMIN,
      ).expect(200);

      const auditLog = await prisma!.auditLog.findFirst({
        where: {
          entity: "PRODUCT",
          entityId: productId,
          action: "UPDATE",
        },
      });

      expect(auditLog).toMatchObject({
        userId: expect.any(String),
        action: "UPDATE",
        entity: "PRODUCT",
        entityId: productId,
        oldData: { price: originalPrice },
        newData: { price: "15000.50" },
        reason: "Product price updated",
      });
      expect(personIds).toContain(auditLog?.userId);
    });
  });

  describe("roles", () => {
    it.each(["SUPERADMIN", "BRANCH_LEADER"] as const)(
      "allows %s to update products",
      async (roleName) => {
        await patchProduct(
          productId,
          { name: updatedName },
          tokens[roleName],
        ).expect(200);
      },
    );

    it.each(["BRANCH_ASSISTANT", "DEV"] as const)(
      "denies %s access to product updates",
      async (roleName) => {
        const response = await patchProduct(
          productId,
          { name: updatedName },
          tokens[roleName],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      },
    );

    it("requires authentication", async () => {
      await patchProduct(productId, { name: updatedName }).expect(401);
    });
  });
});
