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

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

interface MinimumStockResponse {
  data: {
    branchId: string;
    productId: string;
    minimumStock: number;
    totalQuantity: number;
    lowStock: boolean;
    lotsUpdated: number;
    lots: { id: string; quantity: number; expirationDate: string }[];
    updatedAt: string;
  };
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-MS-${runId}`;
const INITIAL_MINIMUM_STOCK = 5;
const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const errorOf = (body: unknown) => (body as ApiError).error;

// The service already returns `{ data }` and the API wraps it again, so the
// payload currently arrives as `body.data.data`. This helper accepts both
// shapes so the test keeps working if the double wrapping is fixed.
const resultOf = (body: unknown): MinimumStockResponse["data"] => {
  const outer = (body as { data: Record<string, unknown> }).data;
  return ("data" in outer ? outer.data : outer) as MinimumStockResponse["data"];
};

describe("PATCH /api/v1/branches/:branchId/inventory/:productId (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let documentTypeId = "";
  let categoryId = "";
  let unitOfMeasureId = "";
  let productId = "";
  let unassignedProductId = "";
  let branchId = "";
  let otherBranchId = "";
  let inactiveBranchId = "";
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;

  const patchMinimumStock = (
    targetBranchId: string,
    targetProductId: string,
    body: object,
    token?: string,
  ) => {
    const pending = request(app!.getHttpServer())
      .patch(`/api/v1/branches/${targetBranchId}/inventory/${targetProductId}`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const seedLots = async (
    targetBranchId: string,
    targetProductId: string,
    minimumStock = INITIAL_MINIMUM_STOCK,
  ) => {
    const database = prisma!;
    const lotOne = await database.branchInventory.create({
      data: {
        branchId: targetBranchId,
        productId: targetProductId,
        quantity: 3,
        minimumStock,
        expirationDate: new Date("2027-01-01T00:00:00.000Z"),
      },
    });
    const lotTwo = await database.branchInventory.create({
      data: {
        branchId: targetBranchId,
        productId: targetProductId,
        quantity: 4,
        minimumStock,
        expirationDate: new Date("2027-02-01T00:00:00.000Z"),
      },
    });
    return [lotOne, lotTwo];
  };

  const findAudit = () =>
    prisma!.auditLog.findMany({
      where: {
        entity: "branch_inventory",
        entityId: productId,
        action: "UPDATE",
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const database = app.get(PrismaService);
    prisma = database;
    const jwtService = app.get(JwtService);

    documentTypeId = (
      await database.documentType.create({
        data: { code: DOCUMENT_CODE, name: "Document (e2e minimum stock)" },
      })
    ).id;

    for (const [index, roleName] of roleNames.entries()) {
      const role = await database.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await database.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}${index}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.minimum-stock.${runId}@e2e.test`,
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

    const branch = await database.branch.create({
      data: {
        name: `${runId} Branch Stock`,
        address: "Calle 1 # 2-3",
        phone: "3001112233",
        active: true,
      },
    });
    branchId = branch.id;
    const otherBranch = await database.branch.create({
      data: {
        name: `${runId} Other Branch Stock`,
        address: "Calle 4 # 5-6",
        phone: "3001112244",
        active: true,
      },
    });
    otherBranchId = otherBranch.id;
    const inactiveBranch = await database.branch.create({
      data: {
        name: `${runId} Inactive Branch Stock`,
        address: "Calle 7 # 8-9",
        phone: "3001112255",
        active: false,
      },
    });
    inactiveBranchId = inactiveBranch.id;

    // The branch leader is only assigned to `branchId`.
    await database.userBranch.create({
      data: {
        userId: actorIds.BRANCH_LEADER,
        branchId,
        assignmentDate: new Date(),
        active: true,
      },
    });

    const category = await database.category.create({
      data: { name: `${runId} Stock Category`, active: true },
    });
    categoryId = category.id;
    const unitOfMeasure = await database.unitMeasure.create({
      data: {
        name: `${runId} Stock Unit`,
        abreviation: `MS${runId.slice(-7)}`,
        active: true,
      },
    });
    unitOfMeasureId = unitOfMeasure.id;

    productId = (
      await database.product.create({
        data: {
          name: `${runId} Stock Product`,
          referenceCode: `MS-${runId}`,
          categoryId,
          unitOfMeasureId,
          price: "1000.00",
          active: true,
        },
      })
    ).id;
    unassignedProductId = (
      await database.product.create({
        data: {
          name: `${runId} Unassigned Product`,
          referenceCode: `MSU-${runId}`,
          categoryId,
          unitOfMeasureId,
          price: "1000.00",
          active: true,
        },
      })
    ).id;
  }, 30000);

  beforeEach(async () => {
    if (!prisma) throw new Error("The test database was not initialized.");

    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [productId, unassignedProductId] } },
    });
    await prisma.branchInventory.deleteMany({
      where: { productId: { in: [productId, unassignedProductId] } },
    });
    await seedLots(branchId, productId);
    await seedLots(otherBranchId, productId);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const productIds = [productId, unassignedProductId].filter(Boolean);
        const branchIds = [branchId, otherBranchId, inactiveBranchId].filter(
          Boolean,
        );
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { entityId: { in: productIds } },
              { userId: { in: personIds } },
            ],
          },
        });
        await prisma.branchInventory.deleteMany({
          where: { productId: { in: productIds } },
        });
        await prisma.userBranch.deleteMany({
          where: { userId: { in: personIds } },
        });
        await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
        await prisma.product.deleteMany({ where: { id: { in: productIds } } });
        await prisma.category.deleteMany({
          where: { id: { in: [categoryId].filter(Boolean) } },
        });
        await prisma.unitMeasure.deleteMany({
          where: { id: { in: [unitOfMeasureId].filter(Boolean) } },
        });
        await prisma.userAccount.deleteMany({
          where: { personId: { in: personIds } },
        });
        await prisma.person.deleteMany({ where: { id: { in: personIds } } });
        await prisma.documentType.deleteMany({
          where: { id: documentTypeId },
        });
      }
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("successful updates", () => {
    it("updates the minimum stock of every lot of the product in the branch", async () => {
      const response = await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(200);
      const result = resultOf(response.body);

      const lots = await prisma!.branchInventory.findMany({
        where: { branchId, productId },
        orderBy: { expirationDate: "asc" },
      });
      expect(result).toMatchObject({
        branchId,
        productId,
        minimumStock: 10,
        totalQuantity: 7,
        lowStock: true,
        lotsUpdated: 2,
      });
      expect(result.lots).toEqual(
        lots.map((lot) => ({
          id: lot.id,
          quantity: lot.quantity,
          expirationDate: lot.expirationDate.toISOString(),
        })),
      );
      expect(lots.map((lot) => lot.minimumStock)).toEqual([10, 10]);
      const latestUpdate = Math.max(
        ...lots.map((lot) => lot.updatedAt.getTime()),
      );
      expect(new Date(result.updatedAt).getTime()).toBe(latestUpdate);
    });

    it("does not modify quantities or the same product in another branch", async () => {
      await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(200);

      const lots = await prisma!.branchInventory.findMany({
        where: { branchId, productId },
        orderBy: { expirationDate: "asc" },
      });
      const otherBranchLots = await prisma!.branchInventory.findMany({
        where: { branchId: otherBranchId, productId },
      });
      expect(lots.map((lot) => lot.quantity)).toEqual([3, 4]);
      expect(otherBranchLots).toHaveLength(2);
      expect(otherBranchLots.map((lot) => lot.minimumStock)).toEqual([
        INITIAL_MINIMUM_STOCK,
        INITIAL_MINIMUM_STOCK,
      ]);
    });

    it("reports lowStock false when the total quantity reaches the minimum", async () => {
      const response = await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: 7 },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(resultOf(response.body)).toMatchObject({
        minimumStock: 7,
        totalQuantity: 7,
        lowStock: false,
        lotsUpdated: 2,
      });
    });

    it("accepts zero as minimum stock", async () => {
      const response = await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: 0 },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(resultOf(response.body)).toMatchObject({
        minimumStock: 0,
        lowStock: false,
      });
    });

    it("does not update nor audit when the value does not change", async () => {
      const before = await prisma!.branchInventory.findMany({
        where: { branchId, productId },
        orderBy: { expirationDate: "asc" },
      });

      const response = await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: INITIAL_MINIMUM_STOCK },
        tokens.SUPERADMIN,
      ).expect(200);
      const result = resultOf(response.body);

      expect(result.lotsUpdated).toBe(0);
      expect(result.minimumStock).toBe(INITIAL_MINIMUM_STOCK);
      expect(new Date(result.updatedAt).getTime()).toBe(
        before[0].updatedAt.getTime(),
      );
      expect(await findAudit()).toHaveLength(0);
    });
  });

  describe("validation", () => {
    it.each([
      ["negative value", { minimumStock: -1 }],
      ["decimal value", { minimumStock: 1.5 }],
      ["non numeric value", { minimumStock: "abc" }],
      ["missing minimumStock", {}],
      ["quantity field", { minimumStock: 10, quantity: 100 }],
      ["unknown field", { minimumStock: 10, active: false }],
    ])("rejects %s", async (_label, body) => {
      const response = await patchMinimumStock(
        branchId,
        productId,
        body,
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");

      const lots = await prisma!.branchInventory.findMany({
        where: { branchId, productId },
      });
      expect(lots.map((lot) => lot.minimumStock)).toEqual([
        INITIAL_MINIMUM_STOCK,
        INITIAL_MINIMUM_STOCK,
      ]);
      expect(lots.map((lot) => lot.quantity).sort()).toEqual([3, 4]);
      expect(await findAudit()).toHaveLength(0);
    });

    it("rejects a malformed branch id", async () => {
      await patchMinimumStock(
        "not-a-uuid",
        productId,
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(400);
    });

    it("rejects a malformed product id", async () => {
      await patchMinimumStock(
        branchId,
        "not-a-uuid",
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(400);
    });
  });

  describe("scope and roles", () => {
    it("allows a BRANCH_LEADER to update a branch assigned to them", async () => {
      const response = await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: 10 },
        tokens.BRANCH_LEADER,
      ).expect(200);

      expect(resultOf(response.body)).toMatchObject({
        branchId,
        minimumStock: 10,
        lotsUpdated: 2,
      });
    });

    it("denies a BRANCH_LEADER access to a branch outside their scope", async () => {
      const response = await patchMinimumStock(
        otherBranchId,
        productId,
        { minimumStock: 10 },
        tokens.BRANCH_LEADER,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("BRANCH_OUT_OF_SCOPE");

      const lots = await prisma!.branchInventory.findMany({
        where: { branchId: otherBranchId, productId },
      });
      expect(lots.map((lot) => lot.minimumStock)).toEqual([
        INITIAL_MINIMUM_STOCK,
        INITIAL_MINIMUM_STOCK,
      ]);
      expect(await findAudit()).toHaveLength(0);
    });

    it.each(["BRANCH_ASSISTANT", "DEV"] as const)(
      "denies %s access to the endpoint",
      async (roleName) => {
        const response = await patchMinimumStock(
          branchId,
          productId,
          { minimumStock: 10 },
          tokens[roleName],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect(await findAudit()).toHaveLength(0);
      },
    );

    it("requires authentication", async () => {
      await patchMinimumStock(branchId, productId, { minimumStock: 10 }).expect(
        401,
      );
    });
  });

  describe("not found", () => {
    it("returns 404 when the branch does not exist", async () => {
      const response = await patchMinimumStock(
        randomUUID(),
        productId,
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("BRANCH_NOT_FOUND");
    });

    it("returns 404 when the product is not assigned to the branch", async () => {
      const response = await patchMinimumStock(
        branchId,
        unassignedProductId,
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_ASSIGNED");
    });

    it("returns 404 when the product does not exist", async () => {
      const response = await patchMinimumStock(
        branchId,
        randomUUID(),
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(404);

      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_ASSIGNED");
    });

    it("rejects updates for an inactive branch", async () => {
      const response = await patchMinimumStock(
        inactiveBranchId,
        productId,
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(422);

      expect(errorOf(response.body).code).toBe("BRANCH_INACTIVE");
    });
  });

  describe("audit", () => {
    it("records the old and new values with the automatic reason", async () => {
      await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: 10 },
        tokens.SUPERADMIN,
      ).expect(200);

      const auditLogs = await findAudit();
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0]).toMatchObject({
        userId: actorIds.SUPERADMIN,
        action: "UPDATE",
        entity: "branch_inventory",
        entityId: productId,
        oldData: {
          branchId,
          productId,
          minimumStock: INITIAL_MINIMUM_STOCK,
          totalQuantity: 7,
          lowStock: false,
        },
        newData: {
          branchId,
          productId,
          minimumStock: 10,
          totalQuantity: 7,
          lowStock: true,
        },
        reason: "Minimum stock updated to 10 for product in branch",
      });
    });

    it("attributes the audit log to the authenticated BRANCH_LEADER", async () => {
      await patchMinimumStock(
        branchId,
        productId,
        { minimumStock: 12 },
        tokens.BRANCH_LEADER,
      ).expect(200);

      const auditLogs = await findAudit();
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].userId).toBe(actorIds.BRANCH_LEADER);
    });
  });
});
