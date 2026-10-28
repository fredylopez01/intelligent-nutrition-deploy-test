import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { businessDate } from "../src/common/utils/business-day.util.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

type ActorName = "SUPERADMIN" | "BRANCH_ASSISTANT" | "OTHER_ASSISTANT" | "DEV";

interface SaleResponse {
  data: {
    id: string;
    saleNumber: string;
    status: string;
    subtotal: string;
    discountAmount: string;
    taxAmount: string;
    total: string;
    saleAt: string;
    branch: { id: string; name: string };
    user: { id: string; fullName: string };
    customer: null | { id: string; fullName: string };
    items: Array<{
      productId: string;
      productName: string;
      referenceCode: string;
      quantity: number;
      unitPrice: string;
      subtotal: string;
      total: string;
    }>;
    payments: Array<{
      paymentMethod: { id: string; code: string; name: string };
      amount: string;
      reference: string | null;
    }>;
  };
}

const runId = randomUUID();
const documentCode = `SAL-${runId}`.slice(0, 20);

const productAName = `Producto A ${runId}`.slice(0, 150);
const productBName = `Producto B ${runId}`.slice(0, 150);
const productCName = `Producto C ${runId}`.slice(0, 150);
const productDName = `Producto D ${runId}`.slice(0, 150);

const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const todayUtc = () => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

describe("POST /api/v1/sales (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let branchId: string;
  let otherBranchId: string;
  let sequenceBranchId: string;
  let closedBranchId: string;
  let productAId: string;
  let productBId: string;
  let productCId: string;
  let productDId: string;
  let cashMethodId: string;
  let cardMethodId: string;
  let firstLotCId: string;
  let secondLotCId: string;
  let scarceLotDId: string;
  let sequenceLotAId: string;
  let assistantId: string;
  let otherAssistantId: string;
  const tokens = {} as Record<ActorName, string>;
  const actorIds: string[] = [];

  const branchIds = () => [
    branchId,
    otherBranchId,
    sequenceBranchId,
    closedBranchId,
  ];

  const postSale = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/sales");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const salePayload = (
    overrides: {
      branchId?: string;
      items?: Array<{ productId: string; quantity: number }>;
      payments?: Array<{ paymentMethodId: string; amount: string }>;
    } = {},
  ) => ({
    branchId: overrides.branchId ?? branchId,
    items: overrides.items ?? [{ productId: productAId, quantity: 2 }],
    payments: overrides.payments ?? [
      { paymentMethodId: cashMethodId, amount: "24.70" },
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
        create: { code: documentCode, name: "Documento e2e ventas" },
      })
    ).id;

    let actorSequence = 0;
    for (const [actorName, roleName] of [
      ["SUPERADMIN", "SUPERADMIN"],
      ["BRANCH_ASSISTANT", "BRANCH_ASSISTANT"],
      ["OTHER_ASSISTANT", "BRANCH_ASSISTANT"],
      ["DEV", "DEV"],
    ] as const) {
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
          firstName: actorName,
          lastName: "E2E",
          email: `${actorName.toLowerCase()}.sales.${runId}@e2e.test`,
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
      tokens[actorName] = await jwtService.signAsync({ sub: person.id });
    }

    const createBranch = async (name: string) =>
      (
        await prisma.branch.create({
          data: {
            name: `${name} ${runId}`.slice(0, 100),
            address: "Avenida 5 # 12-34",
            phone: "3007776655",
            active: true,
          },
        })
      ).id;

    branchId = await createBranch("Sede ventas");
    otherBranchId = await createBranch("Sede ajena");
    sequenceBranchId = await createBranch("Sede secuencia");
    closedBranchId = await createBranch("Sede cerrada");

    assistantId = actorIds[1];
    otherAssistantId = actorIds[2];

    await prisma.userBranch.create({
      data: {
        userId: assistantId,
        branchId,
        assignmentDate: todayUtc(),
        active: true,
      },
    });
    await prisma.userBranch.create({
      data: {
        userId: otherAssistantId,
        branchId: otherBranchId,
        assignmentDate: todayUtc(),
        active: true,
      },
    });
    await prisma.userBranch.create({
      data: {
        userId: assistantId,
        branchId: closedBranchId,
        assignmentDate: todayUtc(),
        active: true,
      },
    });
    await prisma.userBranch.create({
      data: {
        userId: assistantId,
        branchId: sequenceBranchId,
        assignmentDate: todayUtc(),
        active: true,
      },
    });

    const category = await prisma.category.create({
      data: { name: `Categoria ventas ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await prisma.unitMeasure.create({
      data: {
        name: `Unidad ${runId}`.slice(0, 50),
        abreviation: `U-${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;

    const createProduct = async (label: string, price: string, name: string) =>
      (
        await prisma.product.create({
          data: {
            name,
            referenceCode: `${label}-${runId}`.slice(0, 50),
            categoryId,
            unitOfMeasureId,
            price,
            active: true,
          },
        })
      ).id;

    productAId = await createProduct("A", "12.35", productAName);
    productBId = await createProduct("B", "0.10", productBName);
    productCId = await createProduct("C", "10.00", productCName);
    productDId = await createProduct("D", "5.00", productDName);

    const cash = await prisma.paymentMethod.create({
      data: {
        code: `CASH-${runId}`.slice(0, 30),
        name: `Efectivo ${runId}`.slice(0, 100),
        active: true,
      },
    });
    cashMethodId = cash.id;
    const card = await prisma.paymentMethod.create({
      data: {
        code: `CARD-${runId}`.slice(0, 30),
        name: `Tarjeta ${runId}`.slice(0, 100),
        active: true,
      },
    });
    cardMethodId = card.id;

    await prisma.branchInventory.create({
      data: {
        branchId,
        productId: productAId,
        quantity: 10,
        minimumStock: 2,
        expirationDate: daysFromNow(30),
      },
    });
    await prisma.branchInventory.create({
      data: {
        branchId,
        productId: productBId,
        quantity: 10,
        minimumStock: 0,
        expirationDate: daysFromNow(30),
      },
    });

    const firstLotC = await prisma.branchInventory.create({
      data: {
        branchId,
        productId: productCId,
        quantity: 1,
        minimumStock: 0,
        expirationDate: daysFromNow(10),
      },
    });
    firstLotCId = firstLotC.id;
    const secondLotC = await prisma.branchInventory.create({
      data: {
        branchId,
        productId: productCId,
        quantity: 5,
        minimumStock: 0,
        expirationDate: daysFromNow(20),
      },
    });
    secondLotCId = secondLotC.id;

    const scarceLotD = await prisma.branchInventory.create({
      data: {
        branchId,
        productId: productDId,
        quantity: 1,
        minimumStock: 0,
        expirationDate: daysFromNow(30),
      },
    });
    scarceLotDId = scarceLotD.id;

    const sequenceLotA = await prisma.branchInventory.create({
      data: {
        branchId: sequenceBranchId,
        productId: productAId,
        quantity: 10,
        minimumStock: 0,
        expirationDate: daysFromNow(30),
      },
    });
    sequenceLotAId = sequenceLotA.id;

    await prisma.branchInventory.create({
      data: {
        branchId: closedBranchId,
        productId: productAId,
        quantity: 100,
        minimumStock: 0,
        expirationDate: daysFromNow(30),
      },
    });

    await prisma.inventoryClosure.create({
      data: {
        branchId: closedBranchId,
        closureDate: businessDate(),
        status: "CONFIRMED",
        confirmed: true,
        locked: true,
        closedAt: new Date(),
      },
    });
  }, 30000);

  afterAll(async () => {
    try {
      const saleIds = (
        await prisma.sale.findMany({
          where: { branchId: { in: branchIds() } },
          select: { id: true },
        })
      ).map(({ id }) => id);
      const productIds = [productAId, productBId, productCId, productDId];
      const paymentMethodIds = [cashMethodId, cardMethodId];

      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: actorIds } }, { entityId: { in: saleIds } }],
        },
      });
      await prisma.inventoryMovement.deleteMany({
        where: {
          OR: [{ saleId: { in: saleIds } }, { productId: { in: productIds } }],
        },
      });
      await prisma.salePayment.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma.saleDetail.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
      await prisma.inventoryClosure.deleteMany({
        where: { branchId: { in: branchIds() } },
      });
      await prisma.branchInventory.deleteMany({
        where: { branchId: { in: branchIds() } },
      });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.paymentMethod.deleteMany({
        where: { id: { in: paymentMethodIds } },
      });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.unitMeasure.deleteMany({ where: { id: unitOfMeasureId } });
      await prisma.userBranch.deleteMany({
        where: { userId: { in: actorIds } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: actorIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: actorIds } } });
      await prisma.branch.deleteMany({ where: { id: { in: branchIds() } } });
      await prisma.documentType.deleteMany({ where: { id: documentTypeId } });
    } finally {
      await app?.close();
    }
  }, 30000);

  it("creates the sale, decrements the stock and registers the exit movement", async () => {
    const stockBefore = await prisma.branchInventory.findFirstOrThrow({
      where: { branchId, productId: productAId },
    });

    const response = await postSale(
      salePayload(),
      tokens.BRANCH_ASSISTANT,
    ).expect(201);
    const sale = (response.body as SaleResponse).data;

    expect(sale).toMatchObject({
      id: expect.any(String),
      saleNumber: expect.stringMatching(/^V-\d{8}-0001$/),
      status: "COMPLETED",
      branch: { id: branchId },
      user: { id: assistantId },
      customer: null,
      subtotal: "24.70",
      discountAmount: "0.00",
      taxAmount: "0.00",
      total: "24.70",
      items: [
        {
          productId: productAId,
          productName: productAName,
          quantity: 2,
          unitPrice: "12.35",
          subtotal: "24.70",
          total: "24.70",
        },
      ],
      payments: [
        {
          paymentMethod: { id: cashMethodId },
          amount: "24.70",
          reference: null,
        },
      ],
    });

    const persisted = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { details: true, payments: true },
    });
    expect(persisted).toMatchObject({
      branchId,
      userId: assistantId,
      status: "COMPLETED",
    });
    expect(persisted.total.toFixed(2)).toBe("24.70");
    expect(persisted.details).toHaveLength(1);
    expect(persisted.details[0]).toMatchObject({
      productId: productAId,
      quantity: 2,
    });
    expect(persisted.details[0].unitPrice.toFixed(2)).toBe("12.35");
    expect(persisted.payments).toHaveLength(1);
    expect(persisted.payments[0].amount.toFixed(2)).toBe("24.70");

    const stockAfter = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: stockBefore.id },
    });
    expect(stockAfter.quantity).toBe(stockBefore.quantity - 2);

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { saleId: sale.id },
    });
    expect(movement).toMatchObject({
      productId: productAId,
      branchId,
      userId: assistantId,
      movementType: "EXIT",
      quantity: 2,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "SALE", entityId: sale.id },
    });
    expect(audit).toBeNull();
  });

  it("returns 422 when an item does not have enough stock", async () => {
    const stockBefore = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: scarceLotDId },
    });

    const response = await postSale(
      salePayload({
        items: [{ productId: productDId, quantity: 2 }],
        payments: [{ paymentMethodId: cashMethodId, amount: "10.00" }],
      }),
      tokens.BRANCH_ASSISTANT,
    ).expect(422);

    expect(errorOf(response.body)).toMatchObject({
      code: "INSUFFICIENT_STOCK",
      details: {
        items: [
          {
            productId: productDId,
            productName: productDName,
            requested: 2,
            available: 1,
          },
        ],
      },
    });

    const stockAfter = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: scarceLotDId },
    });
    expect(stockAfter.quantity).toBe(stockBefore.quantity);
    expect(
      await prisma.saleDetail.count({ where: { productId: productDId } }),
    ).toBe(0);
  });

  it("returns 404 when a product does not exist", async () => {
    const response = await postSale(
      salePayload({
        items: [{ productId: randomUUID(), quantity: 1 }],
      }),
      tokens.BRANCH_ASSISTANT,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 404 when the payment method does not exist", async () => {
    const response = await postSale(
      salePayload({
        payments: [{ paymentMethodId: randomUUID(), amount: "24.70" }],
      }),
      tokens.BRANCH_ASSISTANT,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("PAYMENT_METHOD_NOT_FOUND");
  });

  it("returns 401 when the request has no authentication token", async () => {
    await postSale(salePayload()).expect(401);
  });

  it("returns 403 when the authenticated user cannot register sales", async () => {
    const response = await postSale(salePayload(), tokens.DEV).expect(403);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("returns 422 when the payments do not match the total", async () => {
    const response = await postSale(
      salePayload({
        payments: [{ paymentMethodId: cashMethodId, amount: "20.00" }],
      }),
      tokens.BRANCH_ASSISTANT,
    ).expect(422);

    expect(errorOf(response.body)).toMatchObject({
      code: "PAYMENT_TOTAL_MISMATCH",
      details: { expected: "24.70", received: "20.00" },
    });
  });

  it("returns 422 when the inventory of the day is closed", async () => {
    const response = await postSale(
      salePayload({ branchId: closedBranchId }),
      tokens.BRANCH_ASSISTANT,
    ).expect(422);

    expect(errorOf(response.body).code).toBe("INVENTORY_CLOSED");
  });

  it("numbers the sales of the same branch and day sequentially", async () => {
    const first = await postSale(
      salePayload({
        branchId: sequenceBranchId,
        items: [{ productId: productAId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amount: "12.35" }],
      }),
      tokens.BRANCH_ASSISTANT,
    ).expect(201);
    const second = await postSale(
      salePayload({
        branchId: sequenceBranchId,
        items: [{ productId: productAId, quantity: 1 }],
        payments: [{ paymentMethodId: cashMethodId, amount: "12.35" }],
      }),
      tokens.BRANCH_ASSISTANT,
    ).expect(201);

    const firstNumber = (first.body as SaleResponse).data.saleNumber;
    const secondNumber = (second.body as SaleResponse).data.saleNumber;

    expect(firstNumber).toMatch(/^V-\d{8}-0001$/);
    expect(secondNumber).toMatch(/^V-\d{8}-0002$/);
    expect(secondNumber.slice(0, 11)).toBe(firstNumber.slice(0, 11));

    const stock = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: sequenceLotAId },
    });
    expect(stock.quantity).toBe(8);
  });

  it("returns 403 when the assistant belongs to another branch", async () => {
    const response = await postSale(
      salePayload(),
      tokens.OTHER_ASSISTANT,
    ).expect(403);

    expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
  });

  it("takes the stock from the lot that expires first", async () => {
    await postSale(
      salePayload({
        items: [{ productId: productCId, quantity: 3 }],
        payments: [{ paymentMethodId: cashMethodId, amount: "30.00" }],
      }),
      tokens.BRANCH_ASSISTANT,
    ).expect(201);

    const firstLot = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: firstLotCId },
    });
    const secondLot = await prisma.branchInventory.findUniqueOrThrow({
      where: { id: secondLotCId },
    });

    expect(firstLot.quantity).toBe(0);
    expect(secondLot.quantity).toBe(3);
  });
});
