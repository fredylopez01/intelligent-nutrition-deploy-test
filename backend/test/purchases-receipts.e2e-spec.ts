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

interface ReceiptResponse {
  data: {
    id: string;
    status: string;
    items: Array<{
      id: string;
      productId: string;
      requestedQuantity: number;
      receivedQuantity: number;
      received: boolean;
    }>;
  };
}

const runId = randomUUID().replace(/-/g, "").slice(0, 16);
const documentCode = `REC-${runId}`.slice(0, 20);
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string } }).error;

describe("POST /api/v1/purchases/:purchaseId/receipts (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let supplierId: string;
  let productId: string;
  let pendingPurchaseId: string;
  let pendingDetailId: string;
  let receivedPurchaseId: string;
  let receivedDetailId: string;
  const actorIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const postReceipt = (purchaseId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post(
      `/api/v1/purchases/${purchaseId}/receipts`,
    );
    if (token) pending.set("Authorization", "Bearer".concat(" ", token));
    return pending.send(body);
  };

  const createPurchase = async (
    status: "PENDING_RECEIPT" | "FULLY_RECEIVED",
    receivedQuantity: number,
  ) => {
    const received = status === "FULLY_RECEIVED";
    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber: `R-${runId}-${received ? "F" : "P"}`,
        supplierId,
        userId: actorIds[0],
        subtotal: "40.00",
        total: "40.00",
        status,
        details: {
          create: {
            productId,
            requestedQuantity: 4,
            receivedQuantity,
            unitPrice: "10.00",
            subtotal: "40.00",
            received,
          },
        },
      },
      select: { id: true, details: { select: { id: true } } },
    });
    return { id: purchase.id, detailId: purchase.details[0].id };
  };

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
        create: { code: documentCode, name: "Documento e2e recepciones" },
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
          email: `${roleName.toLowerCase()}.receipts.${runId}@e2e.test`,
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
        lastName: "Recepciones",
        email: `supplier.receipts.${runId}@e2e.test`,
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
      data: { name: `Categoria recepciones ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await prisma.unitMeasure.create({
      data: {
        name: `Unidad recepciones ${runId}`.slice(0, 50),
        abreviation: `R${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
    const product = await prisma.product.create({
      data: {
        name: `Producto recepciones ${runId}`.slice(0, 150),
        referenceCode: `REC-${runId}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "10.00",
        active: true,
      },
    });
    productId = product.id;

    const pendingPurchase = await createPurchase("PENDING_RECEIPT", 0);
    pendingPurchaseId = pendingPurchase.id;
    pendingDetailId = pendingPurchase.detailId;
    const receivedPurchase = await createPurchase("FULLY_RECEIVED", 4);
    receivedPurchaseId = receivedPurchase.id;
    receivedDetailId = receivedPurchase.detailId;
  }, 30000);

  afterAll(async () => {
    try {
      const purchaseIds = [pendingPurchaseId, receivedPurchaseId].filter(
        Boolean,
      );
      await prisma.inventoryMovement.deleteMany({
        where: { purchaseId: { in: purchaseIds } },
      });
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
        await prisma.generalStock.deleteMany({ where: { productId } });
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
      if (actorIds.length > 0) {
        await prisma.userAccount.deleteMany({
          where: { personId: { in: actorIds } },
        });
      }
      const personIds = [...actorIds, supplierId].filter(Boolean);
      if (personIds.length > 0) {
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

  it("receives a purchase and persists the stock entry movement", async () => {
    const response = await postReceipt(
      pendingPurchaseId,
      {
        items: [
          {
            purchaseDetailId: pendingDetailId,
            receivedQuantity: 4,
            expirationDate: "2027-06-30",
          },
        ],
      },
      tokens.SUPERADMIN,
    ).expect(201);
    const purchase = (response.body as ReceiptResponse).data;

    expect(purchase).toMatchObject({
      id: pendingPurchaseId,
      status: "FULLY_RECEIVED",
      items: [
        {
          id: pendingDetailId,
          productId,
          requestedQuantity: 4,
          receivedQuantity: 4,
          received: true,
        },
      ],
    });

    const [persistedPurchase, movements] = await Promise.all([
      prisma.purchase.findUniqueOrThrow({
        where: { id: pendingPurchaseId },
        include: { details: true },
      }),
      prisma.inventoryMovement.findMany({
        where: { purchaseId: pendingPurchaseId },
      }),
    ]);
    expect(persistedPurchase.status).toBe("FULLY_RECEIVED");
    expect(persistedPurchase.details[0]).toMatchObject({
      id: pendingDetailId,
      receivedQuantity: 4,
      received: true,
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      productId,
      userId: actorIds[0],
      movementType: "ENTRY",
      quantity: 4,
      expirationDate: new Date("2027-06-30T00:00:00.000Z"),
      purchaseId: pendingPurchaseId,
    });
    expect(
      await prisma.generalStock.findFirst({
        where: {
          productId,
          expirationDate: new Date("2027-06-30T00:00:00.000Z"),
        },
      }),
    ).toMatchObject({ quantity: 4 });
  });

  it("returns 409 when the purchase has already been fully received", async () => {
    const response = await postReceipt(
      receivedPurchaseId,
      {
        items: [
          {
            purchaseDetailId: receivedDetailId,
            receivedQuantity: 1,
            expirationDate: "2027-06-30",
          },
        ],
      },
      tokens.SUPERADMIN,
    ).expect(409);

    expect(errorOf(response.body).code).toBe("PURCHASE_ALREADY_RECEIVED");
    expect(
      await prisma.inventoryMovement.count({
        where: { purchaseId: receivedPurchaseId },
      }),
    ).toBe(0);
  });

  it("returns 404 when the purchase does not exist", async () => {
    const response = await postReceipt(
      randomUUID(),
      {
        items: [
          {
            purchaseDetailId: randomUUID(),
            receivedQuantity: 1,
            expirationDate: "2027-06-30",
          },
        ],
      },
      tokens.SUPERADMIN,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("PURCHASE_NOT_FOUND");
  });

  it("returns 401 when registering a receipt without authentication", async () => {
    const movementCountBefore = await prisma.inventoryMovement.count({
      where: { purchaseId: pendingPurchaseId },
    });
    await postReceipt(pendingPurchaseId, {
      items: [
        {
          purchaseDetailId: pendingDetailId,
          receivedQuantity: 4,
          expirationDate: "2027-06-30",
        },
      ],
    }).expect(401);

    expect(
      await prisma.inventoryMovement.count({
        where: { purchaseId: pendingPurchaseId },
      }),
    ).toBe(movementCountBefore);
  });

  it("returns 403 when the authenticated role cannot register receipts", async () => {
    const movementCountBefore = await prisma.inventoryMovement.count({
      where: { purchaseId: pendingPurchaseId },
    });
    const response = await postReceipt(
      pendingPurchaseId,
      {
        items: [
          {
            purchaseDetailId: pendingDetailId,
            receivedQuantity: 4,
            expirationDate: "2027-06-30",
          },
        ],
      },
      tokens.BRANCH_ASSISTANT,
    ).expect(403);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
    expect(
      await prisma.inventoryMovement.count({
        where: { purchaseId: pendingPurchaseId },
      }),
    ).toBe(movementCountBefore);
  });
});
