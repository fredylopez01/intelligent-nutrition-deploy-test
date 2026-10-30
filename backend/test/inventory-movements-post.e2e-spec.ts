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
import { businessDate } from "../src/common/utils/business-day.util.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

interface MovementData {
  id: string;
  movementType: string;
  quantity: number;
  expirationDate: string | null;
  product: { id: string; name: string; referenceCode: string; unit: string };
  branch: { id: string; name: string } | null;
  originBranch: { id: string; name: string } | null;
  user: { id: string; fullName: string };
  observation: string | null;
  saleId: string | null;
  purchaseId: string | null;
  movementAt: string;
  resultingQuantity: number;
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-DM-${runId}`;
const EXP_DATE = "2027-12-31";
const EXP_DATE_2 = "2028-06-30";
const EXPIRED_DATE = "2026-01-31";
const STOCK_INITIAL = 50;
const GENERAL_STOCK_INITIAL = 100;

const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const movementOf = (body: unknown) =>
  (body as { data: MovementData }).data;
const errorOf = (body: unknown) =>
  (body as ApiErrorBody).error;

describe("POST /api/v1/inventory-movements (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;

  let documentTypeId = "";
  let categoryId = "";
  let unitOfMeasureId = "";
  let productId = "";
  let inactiveProductId = "";
  let branchId = "";
  let inactiveBranchId = "";
  let otherBranchId = "";

  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;
  let tokenBranchLeaderOther = "";
  let branchLeaderOtherPersonId = "";

  const postMovement = (body: object, token?: string) => {
    const pending = request(app!.getHttpServer())
      .post("/api/v1/inventory-movements")
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const validEntryPayload = (overrides: Record<string, unknown> = {}) => ({
    branchId,
    productId,
    movementType: "ENTRY",
    quantity: 5,
    expirationDate: EXP_DATE,
    ...overrides,
  });

  const validExitPayload = (overrides: Record<string, unknown> = {}) => ({
    branchId,
    productId,
    movementType: "EXIT",
    quantity: 3,
    expirationDate: EXP_DATE,
    observation: "Unidades vencidas retiradas",
    ...overrides,
  });

  const branchStock = async () => {
    const result = await prisma!.branchInventory.aggregate({
      where: { branchId, productId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  };

  const generalStockQty = async () => {
    const result = await prisma!.generalStock.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
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
      await prisma.documentType.create({
        data: { code: DOCUMENT_CODE, name: "Document (e2e direct-movements)" },
      })
    ).id;

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
          lastName: "E2E-DM",
          email: `${roleName.toLowerCase()}.dm.${runId}@e2e.test`,
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

    const branchLeaderRole = await prisma.role.findUniqueOrThrow({
      where: { name: "BRANCH_LEADER" },
    });
    const branchLeaderOtherPerson = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: `${runId}99`,
        firstName: "Other",
        lastName: "Leader-DM",
        email: `other.leader.dm.${runId}@e2e.test`,
        phone: "3001112299",
        address: "Carrera 1 # 1-1",
        userAccount: {
          create: {
            roleId: branchLeaderRole.id,
            active: true,
            mustChangePassword: false,
          },
        },
      },
    });
    personIds.push(branchLeaderOtherPerson.id);
    branchLeaderOtherPersonId = branchLeaderOtherPerson.id;
    tokenBranchLeaderOther = await jwtService.signAsync({
      sub: branchLeaderOtherPerson.id,
    });

    const branch = await prisma.branch.create({
      data: {
        name: `${runId} DM Branch`,
        address: "Calle 1 # 2-3",
        phone: "3001112233",
        active: true,
      },
    });
    branchId = branch.id;

    const inactiveBranch = await prisma.branch.create({
      data: {
        name: `${runId} Inactive DM Branch`,
        address: "Calle 4 # 5-6",
        phone: "3001112244",
        active: false,
      },
    });
    inactiveBranchId = inactiveBranch.id;

    const otherBranch = await prisma.branch.create({
      data: {
        name: `${runId} Other DM Branch`,
        address: "Calle 7 # 8-9",
        phone: "3001112255",
        active: true,
      },
    });
    otherBranchId = otherBranch.id;

    await prisma.userBranch.createMany({
      data: [
        {
          userId: actorIds.BRANCH_LEADER,
          branchId,
          assignmentDate: new Date(),
          active: true,
        },
        {
          userId: actorIds.BRANCH_ASSISTANT,
          branchId,
          assignmentDate: new Date(),
          active: true,
        },
      ],
    });

    await prisma.userBranch.create({
      data: {
        userId: branchLeaderOtherPersonId,
        branchId: otherBranchId,
        assignmentDate: new Date(),
        active: true,
      },
    });

    const category = await prisma.category.create({
      data: { name: `${runId} DM Category`, active: true },
    });
    categoryId = category.id;

    const unitOfMeasure = await prisma.unitMeasure.create({
      data: {
        name: `${runId} DM Unit`,
        abreviation: `DM${runId.slice(-7)}`,
        active: true,
      },
    });
    unitOfMeasureId = unitOfMeasure.id;

    productId = (
      await prisma.product.create({
        data: {
          name: `${runId} DM Product`,
          referenceCode: `DM-${runId}`,
          categoryId,
          unitOfMeasureId,
          price: "12500.00",
          active: true,
        },
      })
    ).id;

    inactiveProductId = (
      await prisma.product.create({
        data: {
          name: `${runId} Inactive DM Product`,
          referenceCode: `DMI-${runId}`,
          categoryId,
          unitOfMeasureId,
          price: "9900.00",
          active: false,
        },
      })
    ).id;
  }, 30000);

  beforeEach(async () => {
    if (!prisma) throw new Error("The test database was not initialized.");

    const productIds = [productId, inactiveProductId].filter(Boolean);

    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.branchInventory.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.generalStock.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.inventoryClosure.deleteMany({
      where: { branchId: { in: [branchId, otherBranchId].filter(Boolean) } },
    });

    await prisma.branchInventory.create({
      data: {
        branchId,
        productId,
        quantity: STOCK_INITIAL,
        minimumStock: 5,
        expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
      },
    });
    await prisma.branchInventory.create({
      data: {
        branchId: otherBranchId,
        productId,
        quantity: STOCK_INITIAL,
        minimumStock: 5,
        expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
      },
    });

    await prisma.generalStock.create({
      data: {
        productId,
        expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
        quantity: GENERAL_STOCK_INITIAL,
      },
    });
  });

  afterAll(async () => {
    try {
      if (!prisma) return;

      const productIds = [productId, inactiveProductId].filter(Boolean);
      const branchIds = [branchId, inactiveBranchId, otherBranchId].filter(
        Boolean,
      );

      await prisma.inventoryMovement.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: personIds } },
      });
      await prisma.notification.deleteMany({
        where: {
          OR: [
            { productId: { in: productIds } },
            { userId: { in: personIds } },
          ],
        },
      });
      await prisma.inventoryClosure.deleteMany({
        where: { branchId: { in: branchIds } },
      });
      await prisma.generalStock.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.branchInventory.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.userBranch.deleteMany({
        where: { userId: { in: personIds } },
      });
      await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.unitMeasure.deleteMany({ where: { id: unitOfMeasureId } });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: personIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
      await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("authentication & authorization", () => {
    it("returns 401 when no token is provided", async () => {
      const response = await postMovement(validEntryPayload());
      expect(response.status).toBe(401);
    });

    it("returns 403 when DEV role is not allowed for this endpoint", async () => {
      const response = await postMovement(validEntryPayload(), tokens.DEV);
      expect(response.status).toBe(403);
    });

    it("returns 403 BRANCH_SCOPE_VIOLATION when BRANCH_LEADER accesses another branch", async () => {
      const response = await postMovement(
        validEntryPayload({ branchId }),
        tokenBranchLeaderOther,
      );
      expect(response.status).toBe(403);
      expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it("allows SUPERADMIN to create a movement in a branch without an assignment", async () => {
      const response = await postMovement(
        validEntryPayload({ branchId: otherBranchId }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(movementOf(response.body).branch).toMatchObject({
        id: otherBranchId,
      });
    });

    it("returns 201 when BRANCH_ASSISTANT creates a movement for their own branch", async () => {
      const response = await postMovement(
        validEntryPayload(),
        tokens.BRANCH_ASSISTANT,
      );
      expect(response.status).toBe(201);
    });
  });

  describe("successful ENTRY movement", () => {
    it("creates an ENTRY with expirationDate and returns the full response shape → 201", async () => {
      const response = await postMovement(
        validEntryPayload({ quantity: 5 }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(201);
      const mov = movementOf(response.body);
      expect(mov.movementType).toBe("ENTRY");
      expect(mov.quantity).toBe(5);
      expect(mov.expirationDate).toBe(EXP_DATE);
      expect(mov.branch).toMatchObject({ id: branchId });
      expect(mov.originBranch).toBeNull();
      expect(mov.observation).toBeNull();
      expect(mov.saleId).toBeNull();
      expect(mov.purchaseId).toBeNull();
      expect(mov.product).toMatchObject({ id: productId });
      expect(mov.user).toMatchObject({ id: actorIds.SUPERADMIN });
      expect(typeof mov.id).toBe("string");
      expect(typeof mov.movementAt).toBe("string");
      expect(mov.resultingQuantity).toBe(STOCK_INITIAL + 5);
    });

    it("increments the matching lot and decrements generalStock on ENTRY", async () => {
      await postMovement(validEntryPayload({ quantity: 10 }), tokens.SUPERADMIN);
      expect(await branchStock()).toBe(STOCK_INITIAL + 10);
      expect(await generalStockQty()).toBe(GENERAL_STOCK_INITIAL - 10);
    });

    it("creates a new lot when expirationDate has no match in the branch → 201", async () => {
      await prisma!.generalStock.create({
        data: {
          productId,
          expirationDate: new Date(`${EXP_DATE_2}T00:00:00.000Z`),
          quantity: GENERAL_STOCK_INITIAL,
        },
      });
      const response = await postMovement(
        validEntryPayload({ expirationDate: EXP_DATE_2, quantity: 3 }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(201);
      expect(movementOf(response.body).expirationDate).toBe(EXP_DATE_2);
      expect(await branchStock()).toBe(STOCK_INITIAL + 3);
    });

    it("uses FEFO from generalStock when expirationDate is omitted → 201", async () => {
      const { expirationDate: _omit, ...noDate } = validEntryPayload();
      const response = await postMovement(noDate, tokens.SUPERADMIN);
      expect(response.status).toBe(201);
      expect(movementOf(response.body).expirationDate).toBe(EXP_DATE);
    });

    it("BRANCH_LEADER creates an ENTRY for their own branch → 201", async () => {
      const response = await postMovement(
        validEntryPayload(),
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(201);
    });
  });

  describe("successful EXIT movement", () => {
    it("creates an EXIT with expirationDate and returns the full response shape → 201", async () => {
      const response = await postMovement(
        validExitPayload({ quantity: 3 }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(201);
      const mov = movementOf(response.body);
      expect(mov.movementType).toBe("EXIT");
      expect(mov.quantity).toBe(3);
      expect(mov.expirationDate).toBe(EXP_DATE);
      expect(mov.observation).toBe("Unidades vencidas retiradas");
      expect(mov.branch).toMatchObject({ id: branchId });
      expect(mov.originBranch).toBeNull();
      expect(mov.saleId).toBeNull();
      expect(mov.purchaseId).toBeNull();
      expect(mov.product).toMatchObject({ id: productId });
      expect(mov.user).toMatchObject({ id: actorIds.SUPERADMIN });
      expect(mov.resultingQuantity).toBe(STOCK_INITIAL - 3);
    });

    it("decrements the matching lot in branchInventory (persistence check)", async () => {
      await postMovement(validExitPayload({ quantity: 10 }), tokens.SUPERADMIN);
      expect(await branchStock()).toBe(STOCK_INITIAL - 10);
    });

    it("selects the FEFO non-expired lot when expirationDate is omitted → 201", async () => {
      const { expirationDate: _omit, ...noDate } = validExitPayload();
      const response = await postMovement(noDate, tokens.BRANCH_LEADER);
      expect(response.status).toBe(201);
      expect(movementOf(response.body).movementType).toBe("EXIT");
    });

    it("accepts an observation string for EXIT → 201", async () => {
      const response = await postMovement(
        validExitPayload({ observation: "Retiro por caducidad inminente" }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(201);
      expect(movementOf(response.body).observation).toBe(
        "Retiro por caducidad inminente",
      );
    });
  });

  describe("branch and product validation", () => {
    it("returns 404 BRANCH_NOT_FOUND when branchId does not exist", async () => {
      const response = await postMovement(
        validEntryPayload({ branchId: randomUUID() }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("BRANCH_NOT_FOUND");
    });

    it("returns 422 BRANCH_INACTIVE when branch is inactive", async () => {
      const response = await postMovement(
        validEntryPayload({ branchId: inactiveBranchId }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("BRANCH_INACTIVE");
    });

    it("returns 404 PRODUCT_NOT_FOUND when productId does not exist", async () => {
      const response = await postMovement(
        validEntryPayload({ productId: randomUUID() }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
    });

    it("returns 422 PRODUCT_INACTIVE when product is inactive", async () => {
      const response = await postMovement(
        validEntryPayload({ productId: inactiveProductId }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("PRODUCT_INACTIVE");
    });

    it("returns 404 PRODUCT_NOT_ASSIGNED when the product has no lots in the branch", async () => {
      await prisma!.branchInventory.deleteMany({
        where: { branchId, productId },
      });
      const response = await postMovement(
        validEntryPayload(),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_ASSIGNED");
    });

    it("returns 422 INVENTORY_CLOSED when the day closure is already confirmed", async () => {
      await prisma!.inventoryClosure.create({
        data: {
          branchId,
          closureDate: businessDate(),
          status: "CONFIRMED",
          locked: false,
        },
      });
      const response = await postMovement(
        validEntryPayload(),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("INVENTORY_CLOSED");
    });
  });

  describe("ENTRY-specific errors", () => {
    it("returns 422 LOT_EXPIRED when the provided expirationDate is in the past", async () => {
      const response = await postMovement(
        validEntryPayload({ expirationDate: EXPIRED_DATE }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("LOT_EXPIRED");
    });

    it("returns 422 INSUFFICIENT_GENERAL_STOCK when no general stock exists and no expirationDate is given", async () => {
      await prisma!.generalStock.deleteMany({ where: { productId } });
      const { expirationDate: _omit, ...noDate } = validEntryPayload();
      const response = await postMovement(noDate, tokens.SUPERADMIN);
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("INSUFFICIENT_GENERAL_STOCK");
    });

    it("returns 422 INSUFFICIENT_GENERAL_STOCK when generalStock has no lot for the given date", async () => {
      const response = await postMovement(
        validEntryPayload({ expirationDate: EXP_DATE_2 }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("INSUFFICIENT_GENERAL_STOCK");
    });
  });

  describe("EXIT-specific errors", () => {
    it("returns 404 LOT_NOT_FOUND when no lot matches the requested expirationDate", async () => {
      const response = await postMovement(
        validExitPayload({ expirationDate: EXP_DATE_2 }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("LOT_NOT_FOUND");
    });

    it("returns 422 INSUFFICIENT_STOCK when quantity exceeds the lot's available stock", async () => {
      const response = await postMovement(
        validExitPayload({ quantity: STOCK_INITIAL + 1 }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("INSUFFICIENT_STOCK");
    });

    it("returns 400 when observation is missing for an EXIT movement", async () => {
      const { observation: _omit, ...noObs } = validExitPayload();
      const response = await postMovement(noObs, tokens.SUPERADMIN);
      expect(response.status).toBe(400);
    });

    it("returns 400 when observation is too short for an EXIT movement (< 3 chars)", async () => {
      const response = await postMovement(
        validExitPayload({ observation: "ab" }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });
  });

  describe("DTO validation", () => {
    it("returns 400 when movementType is 'TRANSFER' (not a valid DirectMovementType)", async () => {
      const response = await postMovement(
        validEntryPayload({ movementType: "TRANSFER" }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when movementType is missing", async () => {
      const { movementType: _omit, ...noType } = validEntryPayload();
      const response = await postMovement(noType, tokens.SUPERADMIN);
      expect(response.status).toBe(400);
    });

    it("returns 400 when quantity is 0 (minimum is 1)", async () => {
      const response = await postMovement(
        validEntryPayload({ quantity: 0 }),
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when quantity is missing", async () => {
      const { quantity: _omit, ...noQty } = validEntryPayload();
      const response = await postMovement(noQty, tokens.SUPERADMIN);
      expect(response.status).toBe(400);
    });
  });
});
