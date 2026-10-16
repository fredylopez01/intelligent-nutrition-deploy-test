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
  };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-P-${runId}`;
const productName = (label: string) => `${runId} ${label}`;
const referenceCode = (sequence: number) => `P-${runId}-${sequence}`;
const productOf = (body: unknown) => (body as ProductResponse).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

describe("POST /api/v1/products (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService | undefined;
  let documentTypeId: string;
  let sequence = 0;
  let categoryId: string;
  let inactiveCategoryId: string;
  let unitOfMeasureId: string;
  let inactiveUnitOfMeasureId: string;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const nextReferenceCode = () => {
    sequence += 1;
    return referenceCode(sequence);
  };

  const postProduct = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/products");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const productCount = (code: string) =>
    prisma!.product.count({ where: { referenceCode: code } });

  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    name: productName("Proteína Whey"),
    referenceCode: nextReferenceCode(),
    description: "Proteína de suero",
    categoryId,
    unitOfMeasureId,
    price: "12500.5",
    ...overrides,
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
          name: "CC (e2e productos)",
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
          email: `${roleName.toLowerCase()}.products.create.${runId}@e2e.test`,
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

    const activeCategory = await prisma.category.create({
      data: { name: productName("Categoría activa"), active: true },
    });
    categoryId = activeCategory.id;
    const inactiveCategory = await prisma.category.create({
      data: { name: productName("Categoría inactiva"), active: false },
    });
    inactiveCategoryId = inactiveCategory.id;

    const activeUnit = await prisma.unitMeasure.create({
      data: {
        name: productName("Unidad activa"),
        abreviation: `A${runId}`,
        active: true,
      },
    });
    unitOfMeasureId = activeUnit.id;
    const inactiveUnit = await prisma.unitMeasure.create({
      data: {
        name: productName("Unidad inactiva"),
        abreviation: `I${runId}`,
        active: false,
      },
    });
    inactiveUnitOfMeasureId = inactiveUnit.id;
  }, 30000);

  afterAll(async () => {
    try {
      if (!prisma) return;

      const products = await prisma.product.findMany({
        where: { referenceCode: { startsWith: `P-${runId}-` } },
        select: { id: true },
      });
      const productIds = products.map(({ id }) => id);
      const fixtureCategoryIds = [categoryId, inactiveCategoryId].filter(
        Boolean,
      );
      const fixtureUnitIds = [unitOfMeasureId, inactiveUnitOfMeasureId].filter(
        Boolean,
      );

      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: actorIds } }, { entityId: { in: productIds } }],
        },
      });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.category.deleteMany({
        where: { id: { in: fixtureCategoryIds } },
      });
      await prisma.unitMeasure.deleteMany({
        where: { id: { in: fixtureUnitIds } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: actorIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: actorIds } } });
      await prisma.documentType.deleteMany({
        where: { code: DOCUMENT_CODE },
      });
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("creation", () => {
    it("creates a product without general_stock and records the audit log", async () => {
      const payload = validPayload();

      const response = await postProduct(payload, tokens.SUPERADMIN).expect(
        201,
      );

      const product = productOf(response.body);
      expect(product).toMatchObject({
        id: expect.any(String),
        name: payload.name,
        referenceCode: payload.referenceCode,
        description: payload.description,
        categoryId,
        unitOfMeasureId,
        price: "12500.50",
        active: true,
        primaryImageUrl: null,
      });
      expect(product).not.toHaveProperty("general_stock");
      expect(product).not.toHaveProperty("generalStock");
      expect(await productCount(payload.referenceCode)).toBe(1);

      const persistedProduct = await prisma!.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(persistedProduct).not.toHaveProperty("general_stock");
      expect(persistedProduct).not.toHaveProperty("generalStock");

      const auditLog = await prisma!.auditLog.findFirst({
        where: {
          entity: "PRODUCT",
          entityId: product.id,
          action: "CREATE",
        },
      });
      expect(auditLog).toMatchObject({
        userId: actorIds[0],
        action: "CREATE",
        entity: "PRODUCT",
        entityId: product.id,
        newData: {
          name: payload.name,
          referenceCode: payload.referenceCode,
          categoryId,
          unitOfMeasureId,
          price: "12500.5",
        },
      });
    });

    it("creates a product without an optional description", async () => {
      const payload = validPayload({ description: undefined });

      const response = await postProduct(payload, tokens.SUPERADMIN).expect(
        201,
      );

      expect(productOf(response.body)).toMatchObject({
        referenceCode: payload.referenceCode,
        description: null,
      });
    });
  });

  describe("required fields and validation", () => {
    const missingFields: Array<
      [string, (payload: ReturnType<typeof validPayload>) => object]
    > = [
      ["name", (payload) => ({ ...payload, name: undefined })],
      [
        "referenceCode",
        (payload) => ({ ...payload, referenceCode: undefined }),
      ],
      ["categoryId", (payload) => ({ ...payload, categoryId: undefined })],
      [
        "unitOfMeasureId",
        (payload) => ({ ...payload, unitOfMeasureId: undefined }),
      ],
      ["price", (payload) => ({ ...payload, price: undefined })],
    ];

    it.each(missingFields)(
      "rejects a request missing %s",
      async (field, createPayload) => {
        const payload = createPayload(validPayload());
        const response = await postProduct(payload, tokens.SUPERADMIN).expect(
          400,
        );

        expect(errorOf(response.body)).toMatchObject({
          code: "BAD_REQUEST",
          message: "Request validation failed.",
        });
        expect(errorOf(response.body).details).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
      },
    );

    it.each(["not-a-price", "12.345", "-4.00"])(
      "rejects invalid price %s",
      async (price) => {
        const payload = validPayload({ price });
        const response = await postProduct(payload, tokens.SUPERADMIN).expect(
          400,
        );

        expect(errorOf(response.body).details).toEqual(
          expect.arrayContaining([expect.stringContaining("price")]),
        );
        expect(await productCount(payload.referenceCode)).toBe(0);
      },
    );
  });

  describe("duplicate reference code", () => {
    it("answers 409 when a product with the same reference code exists", async () => {
      const code = nextReferenceCode();
      await prisma!.product.create({
        data: {
          name: productName("Producto existente"),
          referenceCode: code,
          categoryId,
          unitOfMeasureId,
          price: "10.00",
        },
      });

      const response = await postProduct(
        validPayload({ referenceCode: code.toLowerCase() }),
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "PRODUCT_REFERENCE_CODE_ALREADY_EXISTS",
        message: "Product with this reference code already exists",
      });
      expect(
        await prisma!.product.count({
          where: { referenceCode: { equals: code, mode: "insensitive" } },
        }),
      ).toBe(1);
    });
  });

  describe("category and unit references", () => {
    it("rejects a category that does not exist", async () => {
      const payload = validPayload({
        categoryId: "11111111-1111-4111-8111-111111111111",
      });

      const response = await postProduct(payload, tokens.SUPERADMIN).expect(
        404,
      );

      expect(errorOf(response.body).code).toBe("CATEGORY_NOT_FOUND");
      expect(await productCount(payload.referenceCode)).toBe(0);
    });

    it("rejects an inactive category", async () => {
      const payload = validPayload({ categoryId: inactiveCategoryId });

      const response = await postProduct(payload, tokens.SUPERADMIN).expect(
        422,
      );

      expect(errorOf(response.body).code).toBe("CATEGORY_INACTIVE");
      expect(await productCount(payload.referenceCode)).toBe(0);
    });

    it("rejects a unit of measure that does not exist", async () => {
      const payload = validPayload({
        unitOfMeasureId: "22222222-2222-4222-8222-222222222222",
      });

      const response = await postProduct(payload, tokens.SUPERADMIN).expect(
        404,
      );

      expect(errorOf(response.body).code).toBe("UNIT_NOT_FOUND");
      expect(await productCount(payload.referenceCode)).toBe(0);
    });

    it("rejects an inactive unit of measure", async () => {
      const payload = validPayload({
        unitOfMeasureId: inactiveUnitOfMeasureId,
      });

      const response = await postProduct(payload, tokens.SUPERADMIN).expect(
        422,
      );

      expect(errorOf(response.body).code).toBe("UNIT_INACTIVE");
      expect(await productCount(payload.referenceCode)).toBe(0);
    });
  });

  describe("role access", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER"])(
      "allows %s to create a product",
      async (roleName) => {
        const payload = validPayload({
          name: productName(`Permitido ${roleName}`),
        });

        const response = await postProduct(payload, tokens[roleName]).expect(
          201,
        );

        expect(productOf(response.body)).toMatchObject({
          name: payload.name,
          referenceCode: payload.referenceCode,
        });
        expect(await productCount(payload.referenceCode)).toBe(1);
      },
    );

    it.each<RoleName>(["BRANCH_ASSISTANT", "DEV"])(
      "rejects %s without creating a product",
      async (roleName) => {
        const payload = validPayload();

        const response = await postProduct(payload, tokens[roleName]).expect(
          403,
        );

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect(await productCount(payload.referenceCode)).toBe(0);
      },
    );

    it("rejects requests without an access token", async () => {
      const payload = validPayload();

      await postProduct(payload).expect(401);

      expect(await productCount(payload.referenceCode)).toBe(0);
    });
  });
});
