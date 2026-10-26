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

interface ReversedSaleResponse {
  id: string;
  saleNumber: string;
  status: string;
  reversalReason: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

const runId = randomUUID().replace(/-/g, "").slice(0, 16);
const documentCode = `REV-${runId}`.slice(0, 20);
const reversalReason = "Customer returned the complete purchase";
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string } }).error;

describe("POST /api/v1/sales/:saleId/reverse (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let branchId: string;
  let productId: string;
  let inventoryId: string;
  let completedSaleId: string;
  let reversedSaleId: string;
  const actorIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const postReverse = (saleId: string, reason: string, token?: string) => {
    const pending = request(app.getHttpServer())
      .post(`/api/v1/sales/${saleId}/reverse`)
      .send({ reason });
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const createSale = async (
    saleNumber: string,
    status: "COMPLETED" | "REVERSED",
  ) => {
    const sale = await prisma.sale.create({
      data: {
        saleNumber,
        branchId,
        userId: actorIds[0],
        saleAt: new Date("2026-10-25T15:30:00.000Z"),
        subtotal: "24.70",
        discountAmount: "0.00",
        taxAmount: "0.00",
        total: "24.70",
        status,
        reversalReason: status === "REVERSED" ? "Previously reversed" : null,
        reversedAt:
          status === "REVERSED" ? new Date("2026-10-25T16:00:00.000Z") : null,
        details: {
          create: {
            productId,
            quantity: 2,
            unitPrice: "12.35",
            subtotal: "24.70",
            discountAmount: "0.00",
            taxAmount: "0.00",
            total: "24.70",
          },
        },
      },
      select: { id: true },
    });
    return sale.id;
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
        create: { code: documentCode, name: "Documento e2e reversión" },
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
          email: `${roleName.toLowerCase()}.sales-reverse.${runId}@e2e.test`,
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

    const branch = await prisma.branch.create({
      data: {
        name: `Sede reversión ${runId}`.slice(0, 100),
        address: "Calle 10 # 20-30",
        phone: "3001112233",
        active: true,
      },
    });
    branchId = branch.id;

    const category = await prisma.category.create({
      data: { name: `Categoria reversión ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await prisma.unitMeasure.create({
      data: {
        name: `Unidad reversión ${runId}`.slice(0, 50),
        abreviation: `V${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
    const product = await prisma.product.create({
      data: {
        name: `Producto reversión ${runId}`.slice(0, 150),
        referenceCode: `REV-${runId}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "12.35",
        active: true,
      },
    });
    productId = product.id;

    const inventory = await prisma.branchInventory.create({
      data: {
        branchId,
        productId,
        quantity: 5,
        minimumStock: 1,
        expirationDate: new Date("2027-10-25T00:00:00.000Z"),
      },
    });
    inventoryId = inventory.id;

    completedSaleId = await createSale(`V-${runId}-C`, "COMPLETED");
    reversedSaleId = await createSale(`V-${runId}-R`, "REVERSED");
  }, 30000);

  afterAll(async () => {
    try {
      const saleIds = [completedSaleId, reversedSaleId].filter(Boolean);
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
      if (inventoryId) {
        await prisma.branchInventory.deleteMany({ where: { id: inventoryId } });
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

  it("reverses a sale with status 200 and restores its inventory", async () => {
    const response = await postReverse(
      completedSaleId,
      reversalReason,
      tokens.SUPERADMIN,
    ).expect(200);
    const sale = (response.body as { data: ReversedSaleResponse }).data;

    expect(sale).toMatchObject({
      id: completedSaleId,
      saleNumber: `V-${runId}-C`,
      status: "REVERSED",
      reversalReason,
      items: [{ productId, quantity: 2 }],
    });

    const [persistedSale, inventory, movements] = await Promise.all([
      prisma.sale.findUniqueOrThrow({ where: { id: completedSaleId } }),
      prisma.branchInventory.findUniqueOrThrow({ where: { id: inventoryId } }),
      prisma.inventoryMovement.findMany({
        where: { saleId: completedSaleId },
      }),
    ]);
    expect(persistedSale.status).toBe("REVERSED");
    expect(persistedSale.reversalReason).toBe(reversalReason);
    expect(inventory.quantity).toBe(7);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      productId,
      branchId,
      userId: actorIds[0],
      movementType: "ENTRY",
      quantity: 2,
      saleId: completedSaleId,
    });
  });

  it("returns 409 when the sale has already been reversed", async () => {
    const response = await postReverse(
      reversedSaleId,
      reversalReason,
      tokens.SUPERADMIN,
    ).expect(409);

    expect(errorOf(response.body).code).toBe("SALE_ALREADY_REVERSED");
    expect(
      await prisma.inventoryMovement.count({
        where: { saleId: reversedSaleId },
      }),
    ).toBe(0);
  });

  it("returns 404 when the sale does not exist", async () => {
    const response = await postReverse(
      randomUUID(),
      reversalReason,
      tokens.SUPERADMIN,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("SALE_NOT_FOUND");
  });

  it("returns 401 when reversing without authentication", async () => {
    const quantityBefore = (
      await prisma.branchInventory.findUniqueOrThrow({
        where: { id: inventoryId },
        select: { quantity: true },
      })
    ).quantity;
    await postReverse(completedSaleId, reversalReason).expect(401);

    const inventory = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true },
    });
    expect(inventory.quantity).toBe(quantityBefore);
  });

  it("returns 403 when the authenticated role cannot reverse sales", async () => {
    const quantityBefore = (
      await prisma.branchInventory.findUniqueOrThrow({
        where: { id: inventoryId },
        select: { quantity: true },
      })
    ).quantity;
    const response = await postReverse(
      completedSaleId,
      reversalReason,
      tokens.BRANCH_ASSISTANT,
    ).expect(403);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
    const inventory = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true },
    });
    expect(inventory.quantity).toBe(quantityBefore);
  });
});
