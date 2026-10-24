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

type RoleName = "SUPERADMIN" | "BRANCH_ASSISTANT";

interface PurchaseResponse {
  data: {
    id: string;
    purchaseNumber: string;
    status: string;
    subtotal: string;
    total: string;
    supplier: { id: string; commercialName: string | null };
    items: Array<{
      productId: string;
      productName: string;
      requestedQuantity: number;
      unitPrice: string;
      subtotal: string;
    }>;
  };
}

const runId = randomUUID();
const documentCode = `PUR-${runId}`.slice(0, 20);
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string } }).error;

describe("POST /api/v1/purchases (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let supplierId: string;
  let productId: string;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];

  const postPurchase = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/purchases");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const validPayload = (
    overrides: {
      supplierId?: string;
      productId?: string;
    } = {},
  ) => ({
    supplierId: overrides.supplierId ?? supplierId,
    observation: `Compra de integración ${runId}`,
    items: [
      {
        productId: overrides.productId ?? productId,
        requestedQuantity: 2,
        unitPrice: "100.00",
        observation: "Producto de prueba",
      },
    ],
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
        where: { code: documentCode },
        update: { active: true },
        create: { code: documentCode, name: "Documento e2e compras" },
      })
    ).id;

    let actorSequence = 0;
    for (const roleName of ["SUPERADMIN", "BRANCH_ASSISTANT"] as const) {
      actorSequence += 1;
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}-${actorSequence}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.purchases.${runId}@e2e.test`,
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

    const supplierPerson = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: `${runId}-s`,
        firstName: "Proveedor",
        lastName: "E2E",
        email: `supplier.purchases.${runId}@e2e.test`,
        phone: "3001112233",
        address: "Calle 10 # 20-30",
      },
    });
    supplierId = supplierPerson.id;
    await prisma.supplier.create({
      data: {
        personId: supplierId,
        commercialName: `Proveedor ${runId}`,
        active: true,
      },
    });

    const category = await prisma.category.create({
      data: { name: `Categoria compras ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await prisma.unitMeasure.create({
      data: {
        name: `Unidad ${runId}`.slice(0, 50),
        abreviation: `U${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
    const product = await prisma.product.create({
      data: {
        name: `Producto compras ${runId}`.slice(0, 150),
        referenceCode: `PUR-${runId}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "100.00",
        active: true,
      },
    });
    productId = product.id;
  }, 30000);

  afterAll(async () => {
    try {
      const purchaseIds = (
        await prisma.purchase.findMany({
          where: { userId: { in: actorIds } },
          select: { id: true },
        })
      ).map(({ id }) => id);
      const personIds = [...actorIds, supplierId].filter(Boolean);

      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: actorIds } }, { entityId: { in: purchaseIds } }],
        },
      });
      await prisma.purchaseDetail.deleteMany({
        where: { purchaseId: { in: purchaseIds } },
      });
      await prisma.purchase.deleteMany({ where: { id: { in: purchaseIds } } });
      if (productId) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      if (supplierId) {
        await prisma.supplier.deleteMany({ where: { personId: supplierId } });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      if (unitOfMeasureId) {
        await prisma.unitMeasure.deleteMany({
          where: { id: unitOfMeasureId },
        });
      }
      if (personIds.length > 0) {
        await prisma.userAccount.deleteMany({
          where: { personId: { in: actorIds } },
        });
        await prisma.person.deleteMany({ where: { id: { in: personIds } } });
      }
      if (documentTypeId) {
        await prisma.documentType.deleteMany({
          where: { id: documentTypeId },
        });
      }
    } finally {
      await app?.close();
    }
  }, 30000);

  it("creates a purchase and persists its details", async () => {
    const response = await postPurchase(
      validPayload(),
      tokens.SUPERADMIN,
    ).expect(201);
    const purchase = (response.body as PurchaseResponse).data;

    expect(purchase).toMatchObject({
      id: expect.any(String),
      purchaseNumber: expect.stringMatching(/^C-\d{8}-\d{4}$/),
      status: "PENDING_RECEIPT",
      supplier: { id: supplierId, commercialName: `Proveedor ${runId}` },
      subtotal: "200.00",
      total: "200.00",
      items: [
        {
          productId,
          productName: `Producto compras ${runId}`,
          requestedQuantity: 2,
          unitPrice: "100.00",
          subtotal: "200.00",
        },
      ],
    });

    const persisted = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { details: true },
    });
    expect(persisted).toMatchObject({
      supplierId,
      userId: actorIds[0],
      details: [
        {
          productId,
          requestedQuantity: 2,
        },
      ],
    });
    expect(persisted.subtotal.toFixed(2)).toBe("200.00");
    expect(persisted.total.toFixed(2)).toBe("200.00");
    expect(persisted.details[0].unitPrice.toFixed(2)).toBe("100.00");
    expect(persisted.details[0].subtotal.toFixed(2)).toBe("200.00");
  });

  it("returns 404 when the supplier does not exist", async () => {
    const response = await postPurchase(
      validPayload({ supplierId: randomUUID() }),
      tokens.SUPERADMIN,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("SUPPLIER_NOT_FOUND");
  });

  it("returns 404 when a product does not exist", async () => {
    const response = await postPurchase(
      validPayload({ productId: randomUUID() }),
      tokens.SUPERADMIN,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 401 when the request has no authentication token", async () => {
    await postPurchase(validPayload()).expect(401);
  });

  it("returns 403 when the authenticated user lacks purchase permissions", async () => {
    const response = await postPurchase(
      validPayload(),
      tokens.BRANCH_ASSISTANT,
    ).expect(403);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
  });
});
