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
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";
import { businessDate } from "../src/common/utils/business-day.util.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT";

interface SaleBody {
  id: string;
  saleNumber: string;
  status: string;
  total: string;
  items: { productId: string; quantity: number; total: string }[];
}

interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

const runId = Date.now().toString(36);
const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
];
const at = (value: string) => new Date(`${value}T00:00:00.000Z`);
const saleOf = (body: unknown) => (body as { data: SaleBody }).data;
const errorOf = (body: unknown) => (body as ErrorBody).error;

describe("Sales (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId = "";
  let categoryId = "";
  let unitId = "";
  let productId = "";
  let branchId = "";
  let otherBranchId = "";
  let paymentMethodId = "";
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const lot = async (expirationDate: string) =>
    (
      await prisma.branchInventory.findFirst({
        where: { branchId, productId, expirationDate: at(expirationDate) },
      })
    )?.quantity;

  const saleBody = (quantity: number, amount: string) => ({
    branchId,
    items: [{ productId, quantity }],
    payments: [{ paymentMethodId, amount }],
  });

  const postSale = (token: string, body: Record<string, unknown>) =>
    http().post("/api/v1/sales").set(auth(token)).send(body);

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
      await prisma.documentType.create({
        data: { code: `CC-SAL-${runId}`, name: "Cédula (e2e ventas)" },
      })
    ).id;
    [branchId, otherBranchId] = await Promise.all(
      ["Centro", "Norte"].map((name) =>
        prisma.branch
          .create({
            data: {
              name: `${runId} ${name}`,
              address: "Calle 1",
              phone: "3001112233",
            },
          })
          .then((branch) => branch.id),
      ),
    );
    for (const [index, roleName] of roleNames.entries()) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}${index}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.sales.${runId}@e2e.test`,
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
      if (roleName !== "SUPERADMIN") {
        await prisma.userBranch.create({
          data: { userId: person.id, branchId, assignmentDate: new Date() },
        });
      }
    }
    categoryId = (
      await prisma.category.create({ data: { name: `${runId} Ventas cat` } })
    ).id;
    unitId = (
      await prisma.unitMeasure.create({
        data: { name: `${runId} Unidad`, abreviation: `S${runId.slice(-8)}` },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: `${runId} Whey`,
          referenceCode: `SAL-${runId}`,
          categoryId,
          unitOfMeasureId: unitId,
          price: "100000.00",
        },
      })
    ).id;
    paymentMethodId = (
      await prisma.paymentMethod.create({
        data: { code: `E2E_${runId.toUpperCase()}`, name: `Efectivo ${runId}` },
      })
    ).id;
  }, 30000);

  beforeEach(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { productId } });
    await prisma.notification.deleteMany({ where: { productId } });
    const sales = await prisma.sale.findMany({
      where: { branchId },
      select: { id: true },
    });
    const saleIds = sales.map(({ id }) => id);
    await prisma.salePayment.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.saleDetail.deleteMany({ where: { saleId: { in: saleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.inventoryClosure.deleteMany({ where: { branchId } });
    await prisma.branchInventory.deleteMany({ where: { productId } });
    await prisma.branchInventory.createMany({
      data: [
        {
          branchId,
          productId,
          quantity: 5,
          minimumStock: 1,
          expirationDate: at("2026-01-31"),
        },
        {
          branchId,
          productId,
          quantity: 2,
          minimumStock: 1,
          expirationDate: at("2027-01-31"),
        },
        {
          branchId,
          productId,
          quantity: 6,
          minimumStock: 1,
          expirationDate: at("2027-06-30"),
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma?.inventoryMovement.deleteMany({ where: { productId } });
      await prisma?.notification.deleteMany({
        where: { OR: [{ productId }, { userId: { in: personIds } }] },
      });
      const sales = await prisma?.sale.findMany({
        where: { branchId },
        select: { id: true },
      });
      const saleIds = (sales ?? []).map(({ id }) => id);
      await prisma?.salePayment.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma?.saleDetail.deleteMany({
        where: { saleId: { in: saleIds } },
      });
      await prisma?.sale.deleteMany({ where: { id: { in: saleIds } } });
      await prisma?.auditLog.deleteMany({
        where: { userId: { in: personIds } },
      });
      await prisma?.inventoryClosure.deleteMany({ where: { branchId } });
      await prisma?.branchInventory.deleteMany({ where: { productId } });
      await prisma?.paymentMethod.deleteMany({
        where: { id: paymentMethodId },
      });
      await prisma?.userBranch.deleteMany({
        where: { userId: { in: personIds } },
      });
      await prisma?.product.deleteMany({ where: { id: productId } });
      await prisma?.category.deleteMany({ where: { id: categoryId } });
      await prisma?.unitMeasure.deleteMany({ where: { id: unitId } });
      await prisma?.userAccount.deleteMany({
        where: { personId: { in: personIds } },
      });
      await prisma?.person.deleteMany({ where: { id: { in: personIds } } });
      await prisma?.branch.deleteMany({
        where: { id: { in: [branchId, otherBranchId] } },
      });
      await prisma?.documentType.deleteMany({ where: { id: documentTypeId } });
    } finally {
      await app?.close();
    }
  }, 30000);

  it("sells FEFO across current lots, skipping the expired one", async () => {
    const response = await postSale(
      tokens.BRANCH_ASSISTANT,
      saleBody(3, "300000.00"),
    ).expect(201);

    const sale = saleOf(response.body);
    const today = businessDate().toISOString().slice(0, 10).replace(/-/g, "");
    expect(sale.saleNumber).toBe(`V-${today}-0001`);
    expect(sale).toMatchObject({ status: "COMPLETED", total: "300000.00" });
    expect(await lot("2026-01-31")).toBe(5);
    expect(await lot("2027-01-31")).toBe(0);
    expect(await lot("2027-06-30")).toBe(5);
    const movements = await prisma.inventoryMovement.findMany({
      where: { saleId: sale.id },
      orderBy: { expirationDate: "asc" },
    });
    expect(movements.map((m) => [m.quantity, m.expirationDate])).toEqual([
      [2, at("2027-01-31")],
      [1, at("2027-06-30")],
    ]);
  });

  it("does not sell the expired units", async () => {
    const response = await postSale(
      tokens.BRANCH_LEADER,
      saleBody(9, "900000.00"),
    ).expect(422);

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_STOCK");
    expect(await lot("2027-06-30")).toBe(6);
  });

  it("rejects payments that do not add up to the total", async () => {
    const response = await postSale(
      tokens.BRANCH_LEADER,
      saleBody(1, "90000.00"),
    ).expect(422);

    expect(errorOf(response.body)).toMatchObject({
      code: "PAYMENT_TOTAL_MISMATCH",
      details: { expected: "100000.00", received: "90000.00" },
    });
  });

  it("lets the superadmin register a sale without a branch assignment", async () => {
    const response = await postSale(
      tokens.SUPERADMIN,
      saleBody(1, "100000.00"),
    ).expect(201);

    expect(saleOf(response.body)).toMatchObject({
      status: "COMPLETED",
      total: "100000.00",
    });
  });

  it("rejects a branch outside the assignment", async () => {
    await postSale(tokens.BRANCH_LEADER, {
      ...saleBody(1, "100000.00"),
      branchId: otherBranchId,
    }).expect(403);
  });

  it("lists by branch and requires the branch for branch roles", async () => {
    await postSale(tokens.BRANCH_ASSISTANT, saleBody(1, "100000.00")).expect(
      201,
    );

    await http()
      .get("/api/v1/sales")
      .set(auth(tokens.BRANCH_ASSISTANT))
      .expect(400);
    const response = await http()
      .get("/api/v1/sales")
      .query({ branchId })
      .set(auth(tokens.BRANCH_ASSISTANT))
      .expect(200);
    const body = response.body as {
      data: { itemsCount: number }[];
      meta: { total: number };
    };
    expect(body.meta.total).toBe(1);
    expect(body.data[0].itemsCount).toBe(1);
  });

  it("lets the assistant reverse a sale and returns the units to their lots", async () => {
    const sale = saleOf(
      (
        await postSale(
          tokens.BRANCH_ASSISTANT,
          saleBody(3, "300000.00"),
        ).expect(201)
      ).body,
    );

    const response = await http()
      .post(`/api/v1/sales/${sale.id}/reverse`)
      .set(auth(tokens.BRANCH_ASSISTANT))
      .send({ reason: "El cliente pidió otro sabor" })
      .expect(200);

    expect(saleOf(response.body).status).toBe("REVERSED");
    expect(await lot("2027-01-31")).toBe(2);
    expect(await lot("2027-06-30")).toBe(6);

    const again = await http()
      .post(`/api/v1/sales/${sale.id}/reverse`)
      .set(auth(tokens.BRANCH_LEADER))
      .send({ reason: "Segundo intento de reversa" })
      .expect(409);
    expect(errorOf(again.body).code).toBe("SALE_ALREADY_REVERSED");
  });

  it("does not reverse a sale of a closed day", async () => {
    const sale = saleOf(
      (
        await postSale(tokens.BRANCH_LEADER, saleBody(1, "100000.00")).expect(
          201,
        )
      ).body,
    );
    await prisma.inventoryClosure.create({
      data: {
        branchId,
        closureDate: businessDate(),
        status: "CONFIRMED",
        confirmed: true,
        locked: true,
      },
    });

    const response = await http()
      .post(`/api/v1/sales/${sale.id}/reverse`)
      .set(auth(tokens.SUPERADMIN))
      .send({ reason: "Error en el cobro del día" })
      .expect(422);

    expect(errorOf(response.body).code).toBe("SALE_DAY_CLOSED");
    await postSale(tokens.BRANCH_LEADER, saleBody(1, "100000.00")).expect(422);
  });

  it("shows the sellable products only for an assigned branch", async () => {
    const own = await http()
      .get(`/api/v1/branches/${branchId}/sellable-products`)
      .set(auth(tokens.BRANCH_ASSISTANT))
      .expect(200);
    const body = own.body as {
      data: { availableQuantity: number; unit: string }[];
    };
    expect(body.data[0]).toMatchObject({ availableQuantity: 8 });

    await http()
      .get(`/api/v1/branches/${otherBranchId}/sellable-products`)
      .set(auth(tokens.BRANCH_ASSISTANT))
      .expect(403);
  });
});
