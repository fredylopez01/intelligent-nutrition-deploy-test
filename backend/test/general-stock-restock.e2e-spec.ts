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

type RoleName = "SUPERADMIN" | "BRANCH_LEADER";

interface GeneralStockResponse {
  data: {
    product: {
      id: string;
      name: string;
      referenceCode: string;
    };
    totalQuantity: number;
    lots: Array<{
      id: string;
      quantity: number;
      expirationDate: string;
    }>;
  };
}

const runId = randomUUID().replace(/-/g, "").slice(0, 16);
const documentCode = `GST-${runId}`.slice(0, 20);
const reason = "Inventory recount adjustment";
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string } }).error;

describe("POST /api/v1/general-stock/:productId/restock (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService | undefined;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let productId: string;
  let initialLotId: string;
  let superadminId: string;
  const actorIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const postRestock = (
    targetProductId: string,
    body: object,
    token?: string,
  ) => {
    const pending = request(app.getHttpServer())
      .post(`/api/v1/general-stock/${targetProductId}/restock`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const validPayload = {
    quantity: 7,
    movementType: "ADJUSTMENT_ENTRY",
    reason,
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
        create: { code: documentCode, name: "Documento e2e stock general" },
      })
    ).id;

    let actorSequence = 0;
    for (const roleName of ["SUPERADMIN", "BRANCH_LEADER"] as const) {
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
          email: `${roleName.toLowerCase()}.restock.${runId}@e2e.test`,
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

    const category = await db.category.create({
      data: { name: `Categoria restock ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await db.unitMeasure.create({
      data: {
        name: `Unidad restock ${runId}`.slice(0, 50),
        abreviation: `G${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
    const product = await db.product.create({
      data: {
        name: `Producto restock ${runId}`.slice(0, 150),
        referenceCode: `GST-${runId}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "15.00",
        active: true,
      },
    });
    productId = product.id;

    const lot = await db.generalStock.create({
      data: {
        productId,
        quantity: 12,
        expirationDate: new Date("2027-10-28T00:00:00.000Z"),
      },
    });
    initialLotId = lot.id;
  }, 30000);

  afterAll(async () => {
    try {
      if (!prisma) return;

      await prisma.auditLog.deleteMany({
        where: { userId: { in: actorIds } },
      });
      await prisma.inventoryMovement.deleteMany({
        where: { productId },
      });
      if (productId) {
        await prisma.generalStock.deleteMany({ where: { productId } });
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

  it("restocks successfully and returns the updated stock", async () => {
    const response = await postRestock(
      productId,
      validPayload,
      tokens.SUPERADMIN,
    ).expect(201);
    const stock = (response.body as GeneralStockResponse).data;

    expect(stock).toMatchObject({
      product: {
        id: productId,
        name: `Producto restock ${runId}`,
        referenceCode: `GST-${runId}`,
      },
      totalQuantity: 19,
      lots: [
        {
          id: initialLotId,
          quantity: 19,
          expirationDate: "2027-10-28",
        },
      ],
    });

    const [persistedLot, movement] = await Promise.all([
      prisma!.generalStock.findUniqueOrThrow({ where: { id: initialLotId } }),
      prisma!.inventoryMovement.findFirst({
        where: { productId, userId: superadminId },
      }),
    ]);
    expect(persistedLot.quantity).toBe(19);
    expect(movement).toMatchObject({
      productId,
      branchId: null,
      userId: superadminId,
      movementType: "ADJUSTMENT_ENTRY",
      quantity: 7,
      observation: reason,
      expirationDate: new Date("2027-10-28T00:00:00.000Z"),
    });
  });

  it("returns 404 when the product does not exist", async () => {
    const response = await postRestock(
      randomUUID(),
      validPayload,
      tokens.SUPERADMIN,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 400 when the restock quantity is invalid", async () => {
    const response = await postRestock(
      productId,
      { ...validPayload, quantity: 0 },
      tokens.SUPERADMIN,
    ).expect(400);

    expect(errorOf(response.body).code).toBe("BAD_REQUEST");
  });

  it("returns 401 when restocking without authentication", async () => {
    const quantityBefore = (
      await prisma!.generalStock.findUniqueOrThrow({
        where: { id: initialLotId },
        select: { quantity: true },
      })
    ).quantity;
    await postRestock(productId, validPayload).expect(401);

    const lot = await prisma!.generalStock.findUniqueOrThrow({
      where: { id: initialLotId },
      select: { quantity: true },
    });
    expect(lot.quantity).toBe(quantityBefore);
  });

  it("returns 403 when the user is not a SUPERADMIN", async () => {
    const response = await postRestock(
      productId,
      validPayload,
      tokens.BRANCH_LEADER,
    ).expect(403);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
  });
});
