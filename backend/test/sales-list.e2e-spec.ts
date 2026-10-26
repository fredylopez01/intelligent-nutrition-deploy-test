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

type RoleName = "SUPERADMIN" | "DEV";

interface SaleSummary {
  id: string;
  saleNumber: string;
  status: string;
  total: string;
  itemsCount: number;
}

interface SaleDetail {
  id: string;
  saleNumber: string;
  status: string;
  subtotal: string;
  total: string;
  branch: { id: string; name: string };
  user: { id: string; fullName: string };
  customer: { id: string; fullName: string } | null;
  items: Array<{
    productId: string;
    productName: string;
    referenceCode: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  payments: Array<{
    paymentMethod: { id: string; code: string; name: string };
    amount: string;
  }>;
}

interface SaleDetailResponse {
  data: SaleDetail;
}

interface ListResponse<T> {
  data: T;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const runId = randomUUID().replace(/-/g, "").slice(0, 16);
const documentCode = `SL-${runId}`.slice(0, 20);
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string } }).error;

describe("GET /api/v1/sales (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService | undefined;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let branchId: string;
  let productId: string;
  let superadminId: string;
  let paymentMethodId: string;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];
  const saleIds: string[] = [];
  const saleNumbers: string[] = [];

  const getSales = (token?: string) => {
    const pending = request(app.getHttpServer()).get("/api/v1/sales");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const createSale = async (
    sequence: number,
    status: "COMPLETED" | "REVERSED",
    saleAt: Date,
  ) => {
    const saleNumber = `V-${runId}-${sequence}`;
    const sale = await prisma!.sale.create({
      data: {
        saleNumber,
        branchId,
        userId: superadminId,
        saleAt,
        subtotal: "24.70",
        discountAmount: "1.20",
        taxAmount: "0.00",
        total: "23.50",
        status,
        reversalReason: status === "REVERSED" ? "Reversal fixture" : null,
        reversedAt: status === "REVERSED" ? saleAt : null,
        details: {
          create: {
            productId,
            quantity: 2,
            unitPrice: "12.35",
            subtotal: "24.70",
            discountAmount: "1.20",
            taxAmount: "0.00",
            total: "23.50",
          },
        },
        payments: {
          create: {
            paymentMethodId,
            amount: "23.50",
            reference: `REF-${runId}-${sequence}`,
            paidAt: saleAt,
          },
        },
      },
      select: { id: true },
    });
    saleIds.push(sale.id);
    saleNumbers.push(saleNumber);
    return sale.id;
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
        create: { code: documentCode, name: "Documento e2e ventas listado" },
      })
    ).id;

    let actorSequence = 0;
    for (const roleName of ["SUPERADMIN", "DEV"] as const) {
      actorSequence += 1;
      const role = await db.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await db.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}-${actorSequence}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.sales-list.${runId}@e2e.test`,
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
      if (roleName === "SUPERADMIN") superadminId = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const branch = await db.branch.create({
      data: {
        name: `Sede ventas listado ${runId}`.slice(0, 100),
        address: "Calle 10 # 20-30",
        phone: "3001112233",
        active: true,
      },
    });
    branchId = branch.id;

    const category = await db.category.create({
      data: { name: `Categoria ventas listado ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await db.unitMeasure.create({
      data: {
        name: `Unidad ventas listado ${runId}`.slice(0, 50),
        abreviation: `S${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
    const product = await db.product.create({
      data: {
        name: `Producto ventas listado ${runId}`.slice(0, 150),
        referenceCode: `SL-${runId}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "12.35",
        active: true,
      },
    });
    productId = product.id;

    const paymentMethod = await db.paymentMethod.upsert({
      where: { code: `SL${runId}`.slice(0, 20) },
      update: { active: true },
      create: {
        code: `SL${runId}`.slice(0, 20),
        name: `Método ventas ${runId}`.slice(0, 100),
        active: true,
      },
    });
    paymentMethodId = paymentMethod.id;

    await createSale(1, "COMPLETED", new Date("2026-10-01T10:00:00Z"));
    await createSale(2, "REVERSED", new Date("2026-10-02T10:00:00Z"));
    await createSale(3, "COMPLETED", new Date("2026-10-03T10:00:00Z"));
  }, 30000);

  afterAll(async () => {
    try {
      if (!prisma) return;

      await prisma.inventoryMovement.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: actorIds } }, { entityId: { in: saleIds } }],
        },
      });
      await prisma.salePayment.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma.saleDetail.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
      if (paymentMethodId) {
        await prisma.paymentMethod.deleteMany({
          where: { id: paymentMethodId },
        });
      }
      if (productId) {
        await prisma.product.deleteMany({ where: { id: productId } });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      if (unitOfMeasureId) {
        await prisma.unitMeasure.deleteMany({
          where: { id: unitOfMeasureId },
        });
      }
      if (branchId) {
        await prisma.branch.deleteMany({ where: { id: branchId } });
      }
      if (actorIds.length > 0) {
        await prisma.userAccount.deleteMany({
          where: { personId: { in: actorIds } },
        });
        await prisma.person.deleteMany({
          where: { id: { in: actorIds } },
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

  it("lists sales with pagination and newest sale first", async () => {
    const response = await getSales(tokens.SUPERADMIN)
      .query({ page: 1, limit: 2, branchId })
      .expect(200);
    const result = response.body as ListResponse<SaleSummary[]>;

    expect(result.data.map(({ saleNumber }) => saleNumber)).toEqual([
      saleNumbers[2],
      saleNumbers[1],
    ]);
    expect(result.data.every((sale) => sale.itemsCount === 1)).toBe(true);
    expect(result.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    const nextPage = await getSales(tokens.SUPERADMIN)
      .query({ page: 2, limit: 2, branchId })
      .expect(200);
    expect(
      (nextPage.body as ListResponse<SaleSummary[]>).data.map(
        ({ saleNumber }) => saleNumber,
      ),
    ).toEqual([saleNumbers[0]]);
  });

  it("filters sales by status", async () => {
    const response = await getSales(tokens.SUPERADMIN)
      .query({ status: "REVERSED", branchId })
      .expect(200);
    const result = response.body as ListResponse<SaleSummary[]>;

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: saleIds[1],
      saleNumber: saleNumbers[1],
      status: "REVERSED",
      total: "23.50",
    });
    expect(result.meta).toMatchObject({ total: 1, totalPages: 1 });
  });

  it("returns sale detail, items, and payments by id", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${saleIds[1]}`)
      .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
      .expect(200);
    const sale = (response.body as SaleDetailResponse).data;

    expect(sale).toMatchObject({
      id: saleIds[1],
      saleNumber: saleNumbers[1],
      status: "REVERSED",
      branch: { id: branchId, name: `Sede ventas listado ${runId}` },
      user: { id: superadminId, fullName: "SUPERADMIN E2E" },
      subtotal: "24.70",
      total: "23.50",
      items: [
        {
          productId,
          productName: `Producto ventas listado ${runId}`,
          referenceCode: `SL-${runId}`,
          quantity: 2,
          unitPrice: "12.35",
          total: "23.50",
        },
      ],
      payments: [
        {
          paymentMethod: {
            id: paymentMethodId,
            code: `SL${runId}`,
            name: `Método ventas ${runId}`,
          },
          amount: "23.50",
        },
      ],
    });
  });

  it("returns 404 when the sale id does not exist", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/sales/${randomUUID()}`)
      .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
      .expect(404);

    expect(errorOf(response.body).code).toBe("SALE_NOT_FOUND");
  });

  it("returns 401 when listing sales without authentication", async () => {
    await getSales().expect(401);
  });

  it("returns 403 when a role without sales permission lists sales", async () => {
    const response = await getSales(tokens.DEV).expect(403);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
  });
});
