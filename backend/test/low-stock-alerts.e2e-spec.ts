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

type ActorName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT";

interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  branchId: string | null;
  productId: string | null;
  read: boolean;
}

const runId = randomUUID().replace(/-/g, "").slice(0, 16);
const documentCode = `LS-${runId}`.slice(0, 20);
const initialQuantity = 10;
const minimumStock = 5;
const crossingQuantity = 6;

describe("LOW_STOCK notifications (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let branchId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let productId: string;
  let inventoryId: string;
  let paymentMethodId: string;
  let branchLeaderId: string;
  const actorIds: string[] = [];
  const tokens = {} as Record<ActorName, string>;

  const postSale = (token: string) =>
    request(app.getHttpServer())
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${token}`)
      .send({
        branchId,
        items: [{ productId, quantity: crossingQuantity }],
        payments: [{ paymentMethodId, amount: "60.00" }],
      });

  const postManualExit = (quantity: number, token: string) =>
    request(app.getHttpServer())
      .post("/api/v1/inventory-movements")
      .set("Authorization", `Bearer ${token}`)
      .send({
        branchId,
        productId,
        movementType: "EXIT",
        quantity,
        observation: "Prueba de salida manual",
      });

  const stockLot = () =>
    prisma.branchInventory.findUniqueOrThrow({
      where: { id: inventoryId },
    });

  const lowStockNotifications = () =>
    prisma.notification.findMany({
      where: { productId, type: "LOW_STOCK" },
      orderBy: { createdAt: "asc" },
    });

  const expectBranchAlert = (notifications: NotificationRecord[]) => {
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: branchLeaderId,
          type: "LOW_STOCK",
          title: "Inventario bajo",
          branchId,
          productId,
          read: false,
        }),
      ]),
    );
    expect(notifications[0].message).toContain(
      `Producto alerta ${runId} está por debajo del mínimo`,
    );
    expect(notifications[0].message).toContain("4 de 5");
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
        create: { code: documentCode, name: "Documento e2e LOW_STOCK" },
      })
    ).id;

    const branch = await prisma.branch.create({
      data: {
        name: `Sede alerta stock ${runId}`.slice(0, 100),
        address: "Calle 10 # 20-30",
        phone: "3001112233",
        active: true,
      },
    });
    branchId = branch.id;

    let actorSequence = 0;
    for (const [actorName, roleName] of [
      ["SUPERADMIN", "SUPERADMIN"],
      ["BRANCH_LEADER", "BRANCH_LEADER"],
      ["BRANCH_ASSISTANT", "BRANCH_ASSISTANT"],
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
          email: `${actorName.toLowerCase()}.low-stock.${runId}@e2e.test`,
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
      if (actorName === "BRANCH_LEADER") branchLeaderId = person.id;
    }

    await prisma.userBranch.createMany({
      data: [branchLeaderId, actorIds[2]].map((userId) => ({
        userId,
        branchId,
        assignmentDate: new Date(),
        active: true,
      })),
    });

    const category = await prisma.category.create({
      data: { name: `Categoria alerta ${runId}`.slice(0, 100) },
    });
    categoryId = category.id;
    const unit = await prisma.unitMeasure.create({
      data: {
        name: `Unidad alerta ${runId}`.slice(0, 50),
        abreviation: `L${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
    const product = await prisma.product.create({
      data: {
        name: `Producto alerta ${runId}`.slice(0, 150),
        referenceCode: `LS-${runId}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "10.00",
        active: true,
      },
    });
    productId = product.id;

    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        code: `LS-${runId}`.slice(0, 30),
        name: `Pago alerta ${runId}`.slice(0, 100),
        active: true,
      },
    });
    paymentMethodId = paymentMethod.id;

    const inventory = await prisma.branchInventory.create({
      data: {
        branchId,
        productId,
        quantity: initialQuantity,
        minimumStock,
        expirationDate: new Date(
          `${new Date().getUTCFullYear() + 1}-12-31T00:00:00.000Z`,
        ),
      },
    });
    inventoryId = inventory.id;
  }, 30000);

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { productId } });
    await prisma.inventoryMovement.deleteMany({ where: { productId } });
    await prisma.branchInventory.update({
      where: { id: inventoryId },
      data: { quantity: initialQuantity },
    });
  });

  afterAll(async () => {
    try {
      if (!prisma) return;

      const saleIds = (
        await prisma.sale.findMany({
          where: { branchId },
          select: { id: true },
        })
      ).map(({ id }) => id);
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: actorIds } }, { entityId: { in: saleIds } }],
        },
      });
      await prisma.notification.deleteMany({
        where: { OR: [{ productId }, { userId: { in: actorIds } }] },
      });
      await prisma.inventoryMovement.deleteMany({
        where: { OR: [{ productId }, { saleId: { in: saleIds } }] },
      });
      await prisma.salePayment.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma.saleDetail.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
      await prisma.branchInventory.deleteMany({ where: { productId } });
      await prisma.paymentMethod.deleteMany({ where: { id: paymentMethodId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.unitMeasure.deleteMany({
        where: { id: unitOfMeasureId },
      });
      await prisma.userBranch.deleteMany({
        where: { userId: { in: actorIds } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: actorIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: actorIds } } });
      await prisma.branch.deleteMany({ where: { id: branchId } });
      await prisma.documentType.deleteMany({ where: { id: documentTypeId } });
    } finally {
      await app?.close();
    }
  }, 30000);

  it("creates a LOW_STOCK alert when a sale takes stock below the minimum", async () => {
    await postSale(tokens.BRANCH_ASSISTANT).expect(201);

    expect((await stockLot()).quantity).toBe(4);
    expectBranchAlert(await lowStockNotifications());
  });

  it("creates a LOW_STOCK alert when a manual exit takes stock below the minimum", async () => {
    await postManualExit(crossingQuantity, tokens.BRANCH_ASSISTANT).expect(201);

    expect((await stockLot()).quantity).toBe(4);
    expectBranchAlert(await lowStockNotifications());
  });

  it("does not duplicate the alert when a subsequent exit keeps stock below minimum", async () => {
    await postSale(tokens.BRANCH_ASSISTANT).expect(201);
    const afterCrossing = await lowStockNotifications();
    expectBranchAlert(afterCrossing);

    await postManualExit(1, tokens.BRANCH_ASSISTANT).expect(201);

    const afterAdditionalExit = await lowStockNotifications();
    expect((await stockLot()).quantity).toBe(3);
    expect(afterAdditionalExit).toHaveLength(afterCrossing.length);
    expect(afterAdditionalExit.map(({ id }) => id)).toEqual(
      afterCrossing.map(({ id }) => id),
    );
  });
});
