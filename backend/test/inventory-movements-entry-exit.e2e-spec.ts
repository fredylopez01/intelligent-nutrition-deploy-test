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

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

interface MovementBody {
  data: {
    id: string;
    movementType: string;
    quantity: number;
    expirationDate: string | null;
    branch: { id: string; name: string };
    user: { id: string; fullName: string };
    observation: string | null;
    resultingQuantity: number;
  };
}

interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}

const runId = Date.now().toString(36);
const CURRENT_LOT = "2027-03-31";
const LATER_LOT = "2027-09-30";
const EXPIRED_LOT = "2026-02-28";
const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const at = (value: string) => new Date(`${value}T00:00:00.000Z`);
const movementOf = (body: unknown) => (body as MovementBody).data;
const errorOf = (body: unknown) => (body as ErrorBody).error;

describe("POST /api/v1/inventory-movements (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId = "";
  let categoryId = "";
  let unitId = "";
  let productId = "";
  let branchId = "";
  let otherBranchId = "";
  const personIds: string[] = [];
  const actorIds = {} as Record<RoleName, string>;
  const tokens = {} as Record<RoleName, string>;

  const post = (body: Record<string, unknown>, token?: string) => {
    const pending = request(app.getHttpServer())
      .post("/api/v1/inventory-movements")
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const exit = (overrides: Record<string, unknown> = {}) => ({
    branchId,
    productId,
    movementType: "EXIT",
    quantity: 3,
    observation: "Empaque roto en bodega",
    ...overrides,
  });

  const entry = (overrides: Record<string, unknown> = {}) => ({
    branchId,
    productId,
    movementType: "ENTRY",
    quantity: 5,
    ...overrides,
  });

  const branchLot = async (expirationDate: string) =>
    (
      await prisma.branchInventory.findFirst({
        where: { branchId, productId, expirationDate: at(expirationDate) },
      })
    )?.quantity ?? null;

  const generalLot = async (expirationDate: string) =>
    (
      await prisma.generalStock.findFirst({
        where: { productId, expirationDate: at(expirationDate) },
      })
    )?.quantity ?? null;

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
        data: { code: `CC-MEX-${runId}`, name: "Cédula (e2e entradas)" },
      })
    ).id;
    [branchId, otherBranchId] = await Promise.all(
      ["Centro", "Norte"].map(async (name, index) =>
        prisma.branch
          .create({
            data: {
              name: `${runId} ${name}`,
              address: `Calle ${index + 1}`,
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
          lastName: "E2E-MEX",
          email: `${roleName.toLowerCase()}.movements.${runId}@e2e.test`,
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
      actorIds[roleName] = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }
    await prisma.userBranch.createMany({
      data: (["BRANCH_LEADER", "BRANCH_ASSISTANT"] as const).map(
        (roleName) => ({
          userId: actorIds[roleName],
          branchId,
          assignmentDate: new Date(),
        }),
      ),
    });

    categoryId = (
      await prisma.category.create({ data: { name: `${runId} Creatinas` } })
    ).id;
    unitId = (
      await prisma.unitMeasure.create({
        data: { name: `${runId} Unidad`, abreviation: `M${runId.slice(-8)}` },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: `${runId} Creatina 300 g`,
          referenceCode: `MEX-${runId}`,
          categoryId,
          unitOfMeasureId: unitId,
          price: "89000.00",
        },
      })
    ).id;
  }, 30000);

  beforeEach(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { productId } });
    await prisma.notification.deleteMany({ where: { productId } });
    await prisma.branchInventory.deleteMany({ where: { productId } });
    await prisma.generalStock.deleteMany({ where: { productId } });
    await prisma.inventoryClosure.deleteMany({ where: { branchId } });

    await prisma.branchInventory.createMany({
      data: [
        {
          branchId,
          productId,
          quantity: 4,
          minimumStock: 6,
          expirationDate: at(EXPIRED_LOT),
        },
        {
          branchId,
          productId,
          quantity: 10,
          minimumStock: 6,
          expirationDate: at(CURRENT_LOT),
        },
      ],
    });
    await prisma.generalStock.createMany({
      data: [
        { productId, quantity: 2, expirationDate: at(EXPIRED_LOT) },
        { productId, quantity: 40, expirationDate: at(CURRENT_LOT) },
        { productId, quantity: 15, expirationDate: at(LATER_LOT) },
      ],
    });
  });

  afterAll(async () => {
    try {
      await prisma?.inventoryMovement.deleteMany({ where: { productId } });
      await prisma?.notification.deleteMany({
        where: { OR: [{ productId }, { userId: { in: personIds } }] },
      });
      await prisma?.branchInventory.deleteMany({ where: { productId } });
      await prisma?.generalStock.deleteMany({ where: { productId } });
      await prisma?.inventoryClosure.deleteMany({
        where: { branchId: { in: [branchId, otherBranchId] } },
      });
      await prisma?.auditLog.deleteMany({
        where: { userId: { in: personIds } },
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

  describe("EXIT", () => {
    it("takes the earliest current lot and returns the resulting quantity → 201", async () => {
      const response = await post(exit(), tokens.BRANCH_ASSISTANT).expect(201);

      expect(movementOf(response.body)).toMatchObject({
        movementType: "EXIT",
        quantity: 3,
        expirationDate: CURRENT_LOT,
        branch: { id: branchId },
        user: { id: actorIds.BRANCH_ASSISTANT },
        observation: "Empaque roto en bodega",
        resultingQuantity: 4 + 10 - 3,
      });
      expect(await branchLot(CURRENT_LOT)).toBe(7);
      expect(await branchLot(EXPIRED_LOT)).toBe(4);
    });

    it("writes off an expired lot sent explicitly", async () => {
      await post(
        exit({ expirationDate: EXPIRED_LOT, quantity: 4 }),
        tokens.BRANCH_LEADER,
      ).expect(201);

      expect(await branchLot(EXPIRED_LOT)).toBe(0);
    });

    it("requires the reason of the exit → 400", async () => {
      await post(exit({ observation: undefined }), tokens.SUPERADMIN).expect(
        400,
      );
      await post(exit({ observation: "  " }), tokens.SUPERADMIN).expect(400);
    });

    it("returns 422 INSUFFICIENT_STOCK with the available units of the lot", async () => {
      const response = await post(
        exit({ quantity: 11 }),
        tokens.SUPERADMIN,
      ).expect(422);

      expect(errorOf(response.body)).toMatchObject({
        code: "INSUFFICIENT_STOCK",
        details: { available: 10, requested: 11, expirationDate: CURRENT_LOT },
      });
      expect(await branchLot(CURRENT_LOT)).toBe(10);
    });

    it("notifies LOW_STOCK when the exit crosses the minimum", async () => {
      await post(exit({ quantity: 9 }), tokens.SUPERADMIN).expect(201);

      const notifications = await prisma.notification.findMany({
        where: { productId, type: "LOW_STOCK" },
      });
      expect(notifications.map((n) => n.userId)).toContain(
        actorIds.BRANCH_LEADER,
      );
    });
  });

  describe("ENTRY", () => {
    it("moves units of the earliest current general stock lot into the branch lot", async () => {
      const response = await post(entry(), tokens.BRANCH_LEADER).expect(201);

      expect(movementOf(response.body)).toMatchObject({
        movementType: "ENTRY",
        expirationDate: CURRENT_LOT,
        observation: null,
        resultingQuantity: 4 + 10 + 5,
      });
      expect(await generalLot(CURRENT_LOT)).toBe(35);
      expect(await branchLot(CURRENT_LOT)).toBe(15);
    });

    it("creates the branch lot with the branch minimum for a new expiration", async () => {
      await post(
        entry({ expirationDate: LATER_LOT }),
        tokens.SUPERADMIN,
      ).expect(201);

      const lot = await prisma.branchInventory.findFirst({
        where: { branchId, productId, expirationDate: at(LATER_LOT) },
      });
      expect(lot).toMatchObject({ quantity: 5, minimumStock: 6 });
      expect(await generalLot(LATER_LOT)).toBe(10);
    });

    it("returns 422 INSUFFICIENT_GENERAL_STOCK and leaves both stocks untouched", async () => {
      const response = await post(
        entry({ expirationDate: LATER_LOT, quantity: 16 }),
        tokens.SUPERADMIN,
      ).expect(422);

      expect(errorOf(response.body)).toMatchObject({
        code: "INSUFFICIENT_GENERAL_STOCK",
        details: { requested: 16, available: 15 },
      });
      expect(await generalLot(LATER_LOT)).toBe(15);
      expect(await branchLot(LATER_LOT)).toBeNull();
    });

    it("returns 422 LOT_EXPIRED for an expired general stock lot", async () => {
      const response = await post(
        entry({ expirationDate: EXPIRED_LOT, quantity: 1 }),
        tokens.SUPERADMIN,
      ).expect(422);

      expect(errorOf(response.body).code).toBe("LOT_EXPIRED");
      expect(await generalLot(EXPIRED_LOT)).toBe(2);
    });
  });

  describe("business rules", () => {
    it("returns 404 PRODUCT_NOT_ASSIGNED in a branch without the product", async () => {
      const response = await post(
        exit({ branchId: otherBranchId }),
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_ASSIGNED");
    });

    it("returns 422 INVENTORY_CLOSED after today's closure was confirmed", async () => {
      await prisma.inventoryClosure.create({
        data: {
          branchId,
          closureDate: businessDate(),
          status: "CONFIRMED",
          confirmed: true,
          locked: true,
        },
      });

      const response = await post(entry(), tokens.SUPERADMIN).expect(422);

      expect(errorOf(response.body).code).toBe("INVENTORY_CLOSED");
      expect(await generalLot(CURRENT_LOT)).toBe(40);
    });

    it.each([
      ["a TRANSFER type", { movementType: "TRANSFER" }],
      ["the old items array", { items: [] }],
      ["a decimal quantity", { quantity: 1.5 }],
      ["a client date", { movementAt: "2026-10-26T10:00:00Z" }],
    ])("rejects %s → 400", async (_label, overrides) => {
      await post(exit(overrides), tokens.SUPERADMIN).expect(400);
    });
  });

  describe("role access and scope", () => {
    it("returns 403 BRANCH_SCOPE_VIOLATION for a branch outside the assignment", async () => {
      const response = await post(
        exit({ branchId: otherBranchId }),
        tokens.BRANCH_ASSISTANT,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it("denies DEV → 403 INSUFFICIENT_PERMISSIONS", async () => {
      const response = await post(exit(), tokens.DEV).expect(403);

      expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
    });

    it("returns 401 without a token", async () => {
      await post(exit()).expect(401);
    });
  });
});
