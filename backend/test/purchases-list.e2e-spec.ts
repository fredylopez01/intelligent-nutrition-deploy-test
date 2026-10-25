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

interface PurchaseSummary {
  id: string;
  purchaseNumber: string;
  status: string;
  total: string;
  itemsCount: number;
}

interface PurchaseDetail {
  id: string;
  purchaseNumber: string;
  status: string;
  subtotal: string;
  total: string;
  supplier: { id: string; commercialName: string | null };
  user: { id: string; fullName: string };
  items: Array<{
    productId: string;
    productName: string;
    referenceCode: string;
    requestedQuantity: number;
    unitPrice: string;
    subtotal: string;
  }>;
}

interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const runId = randomUUID().replace(/-/g, "").slice(0, 18);
const documentCode = `PUR-LIST-${runId}`.slice(0, 20);
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string } }).error;

describe("GET /api/v1/purchases (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService | undefined;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let supplierId: string;
  let productId: string;
  let superadminId: string;
  const tokens = {} as Record<RoleName, string>;
  const purchaseIds: string[] = [];
  const purchaseNumbers: string[] = [];

  const getPurchases = (token?: string) => {
    const pending = request(app.getHttpServer()).get("/api/v1/purchases");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const createPurchase = async (
    sequence: number,
    status: "PENDING_RECEIPT" | "FULLY_RECEIVED",
    purchaseAt: Date,
  ) => {
    const purchaseNumber = `E2E-${runId}-${sequence}`;
    const purchase = await prisma!.purchase.create({
      data: {
        purchaseNumber,
        supplierId,
        userId: superadminId,
        purchaseAt,
        subtotal: "20.00",
        total: "20.00",
        status,
        observation: `Compra de listado ${sequence}`,
        details: {
          create: {
            productId,
            requestedQuantity: 2,
            receivedQuantity: status === "FULLY_RECEIVED" ? 2 : 0,
            unitPrice: "10.00",
            subtotal: "20.00",
            received: status === "FULLY_RECEIVED",
            observation: `Detalle ${sequence}`,
          },
        },
      },
      select: { id: true },
    });
    purchaseIds.push(purchase.id);
    purchaseNumbers.push(purchaseNumber);
    return purchase;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const db = app.get(PrismaService);
    prisma = db;
    const jwtService = app.get(JwtService);
    documentTypeId = (
      await db.documentType.upsert({
        where: { code: documentCode },
        update: { active: true },
        create: { code: documentCode, name: "Documento e2e compras" },
      })
    ).id;

    let personSequence = 0;
    for (const roleName of ["SUPERADMIN", "BRANCH_ASSISTANT"] as const) {
      personSequence += 1;
      const role = await db.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await db.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}-${personSequence}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.purchases-list.${runId}@e2e.test`,
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
      if (roleName === "SUPERADMIN") superadminId = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const supplierPerson = await db.person.create({
      data: {
        documentTypeId,
        documentNumber: `${runId}-s`,
        firstName: "Proveedor",
        lastName: "Listado",
        email: `supplier.purchases-list.${runId}@e2e.test`,
        phone: "3001112233",
        address: "Calle 10 # 20-30",
      },
    });
    supplierId = supplierPerson.id;
    await db.supplier.create({
      data: {
        personId: supplierId,
        commercialName: `Proveedor ${runId}`,
        active: true,
      },
    });

    const category = await db.category.create({
      data: { name: `Categoria listado ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await db.unitMeasure.create({
      data: {
        name: `Unidad listado ${runId}`.slice(0, 50),
        abreviation: `L${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
    const product = await db.product.create({
      data: {
        name: `Producto listado ${runId}`.slice(0, 150),
        referenceCode: `PL-${runId}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "10.00",
        active: true,
      },
    });
    productId = product.id;

    await createPurchase(
      1,
      "PENDING_RECEIPT",
      new Date("2026-10-01T10:00:00Z"),
    );
    await createPurchase(2, "FULLY_RECEIVED", new Date("2026-10-02T10:00:00Z"));
    await createPurchase(
      3,
      "PENDING_RECEIPT",
      new Date("2026-10-03T10:00:00Z"),
    );
  }, 30000);

  afterAll(async () => {
    try {
      if (!prisma) return;

      await prisma.purchaseDetail.deleteMany({
        where: { purchaseId: { in: purchaseIds } },
      });
      await prisma.purchase.deleteMany({
        where: { id: { in: purchaseIds } },
      });
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
      const people = await prisma.person.findMany({
        where: { documentTypeId },
        select: { id: true },
      });
      const personIds = people.map(({ id }) => id);
      if (personIds.length > 0) {
        await prisma.userAccount.deleteMany({
          where: { personId: { in: personIds } },
        });
        await prisma.person.deleteMany({
          where: { id: { in: personIds } },
        });
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

  it("lists purchases with pagination and newest purchase first", async () => {
    const response = await getPurchases(tokens.SUPERADMIN)
      .query({ page: 1, limit: 2, supplierId })
      .expect(200);
    const result = response.body as ApiResponse<PurchaseSummary[]>;

    expect(result.data.map(({ purchaseNumber }) => purchaseNumber)).toEqual([
      purchaseNumbers[2],
      purchaseNumbers[1],
    ]);
    expect(result.data.every((purchase) => purchase.itemsCount === 1)).toBe(
      true,
    );
    expect(result.meta).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    const nextPage = await getPurchases(tokens.SUPERADMIN)
      .query({ page: 2, limit: 2, supplierId })
      .expect(200);
    expect(
      (nextPage.body as ApiResponse<PurchaseSummary[]>).data.map(
        ({ purchaseNumber }) => purchaseNumber,
      ),
    ).toEqual([purchaseNumbers[0]]);
  });

  it("filters purchases by status", async () => {
    const response = await getPurchases(tokens.SUPERADMIN)
      .query({ status: "FULLY_RECEIVED", supplierId })
      .expect(200);
    const result = response.body as ApiResponse<PurchaseSummary[]>;

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: purchaseIds[1],
      purchaseNumber: purchaseNumbers[1],
      status: "FULLY_RECEIVED",
    });
    expect(result.meta).toMatchObject({ total: 1, totalPages: 1 });
  });

  it("returns purchase detail and its items by id", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${purchaseIds[1]}`)
      .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
      .expect(200);
    const purchase = (response.body as ApiResponse<PurchaseDetail>).data;

    expect(purchase).toMatchObject({
      id: purchaseIds[1],
      purchaseNumber: purchaseNumbers[1],
      status: "FULLY_RECEIVED",
      subtotal: "20.00",
      total: "20.00",
      supplier: { id: supplierId, commercialName: `Proveedor ${runId}` },
      user: { id: superadminId, fullName: "SUPERADMIN E2E" },
      items: [
        {
          productId,
          productName: `Producto listado ${runId}`,
          referenceCode: `PL-${runId}`,
          requestedQuantity: 2,
          receivedQuantity: 2,
          unitPrice: "10.00",
          subtotal: "20.00",
          received: true,
          observation: "Detalle 2",
        },
      ],
    });
  });

  it("returns 404 when the purchase id does not exist", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/purchases/${randomUUID()}`)
      .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
      .expect(404);

    expect(errorOf(response.body).code).toBe("PURCHASE_NOT_FOUND");
  });

  it("returns 401 when listing without authentication", async () => {
    await getPurchases().expect(401);
  });

  it("returns 403 when a user without purchase permissions requests the list", async () => {
    const response = await getPurchases(tokens.BRANCH_ASSISTANT).expect(403);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
  });
});
