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
import { businessDate } from "../src/common/utils/business-day.util.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

interface AdjustmentResponse {
  data: {
    id: string;
    movementType: "ADJUSTMENT_ENTRY" | "ADJUSTMENT_EXIT";
    quantity: number;
    expirationDate: string | null;
    product: { id: string; name: string; referenceCode: string; unit: string };
    branch: { id: string; name: string };
    originBranch: null;
    user: { id: string; fullName: string };
    observation: string;
    movementAt: string;
    resultingQuantity: number;
  };
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-ADJ-${runId}`;
const EXP_DATE = "2027-12-31";
const STOCK_INITIAL = 50;
const NEW_LOT_DATE = "2028-03-31";
const DEFAULT_REASON = "Diferencia detectada en el conteo físico";

const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const adjustmentOf = (body: unknown) => (body as AdjustmentResponse).data;
const errorOf = (body: unknown) => (body as ApiErrorBody).error;

describe("POST /api/v1/inventory-movements/adjustments (e2e)", () => {
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
  let branchLeaderOtherId = "";

  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;

  const postAdjustment = (body: object, token?: string) => {
    const pending = request(app!.getHttpServer())
      .post("/api/v1/inventory-movements/adjustments")
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const validEntryPayload = (overrides: Record<string, unknown> = {}) => ({
    branchId,
    productId,
    movementType: "ADJUSTMENT_ENTRY",
    quantity: 5,
    expirationDate: EXP_DATE,
    reason: DEFAULT_REASON,
    ...overrides,
  });

  const validExitPayload = (overrides: Record<string, unknown> = {}) =>
    validEntryPayload({ movementType: "ADJUSTMENT_EXIT", ...overrides });

  const lotQuantity = async (expirationDate: string) =>
    (
      await prisma!.branchInventory.findFirst({
        where: {
          branchId,
          productId,
          expirationDate: new Date(`${expirationDate}T00:00:00.000Z`),
        },
        select: { quantity: true },
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
        data: { code: DOCUMENT_CODE, name: "Document (e2e adjustments)" },
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
          lastName: "E2E-ADJ",
          email: `${roleName.toLowerCase()}.adj.${runId}@e2e.test`,
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
        lastName: "Leader-ADJ",
        email: `other.leader.adj.${runId}@e2e.test`,
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
    branchLeaderOtherId = branchLeaderOtherPerson.id;

    const branch = await prisma.branch.create({
      data: {
        name: `${runId} Adjustment Branch`,
        address: "Calle 1 # 2-3",
        phone: "3001112233",
        active: true,
      },
    });
    branchId = branch.id;

    const inactiveBranch = await prisma.branch.create({
      data: {
        name: `${runId} Inactive Adj Branch`,
        address: "Calle 7 # 8-9",
        phone: "3001112255",
        active: false,
      },
    });
    inactiveBranchId = inactiveBranch.id;

    const otherBranch = await prisma.branch.create({
      data: {
        name: `${runId} Other Adj Branch`,
        address: "Calle 10 # 11-12",
        phone: "3001112266",
        active: true,
      },
    });
    otherBranchId = otherBranch.id;

    // BRANCH_LEADER is assigned to branchId
    await prisma.userBranch.create({
      data: {
        userId: actorIds.BRANCH_LEADER,
        branchId,
        assignmentDate: new Date(),
        active: true,
      },
    });

    // The other BRANCH_LEADER is assigned to otherBranchId, NOT to branchId
    await prisma.userBranch.create({
      data: {
        userId: branchLeaderOtherId,
        branchId: otherBranchId,
        assignmentDate: new Date(),
        active: true,
      },
    });

    const category = await prisma.category.create({
      data: { name: `${runId} Adj Category`, active: true },
    });
    categoryId = category.id;

    const unitOfMeasure = await prisma.unitMeasure.create({
      data: {
        name: `${runId} Adj Unit`,
        abreviation: `AD${runId.slice(-7)}`,
        active: true,
      },
    });
    unitOfMeasureId = unitOfMeasure.id;

    productId = (
      await prisma.product.create({
        data: {
          name: `${runId} Adj Product`,
          referenceCode: `ADJ-${runId}`,
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
          name: `${runId} Inactive Adj Product`,
          referenceCode: `ADJI-${runId}`,
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

    await prisma.inventoryMovement.deleteMany({
      where: {
        productId: { in: [productId, inactiveProductId].filter(Boolean) },
      },
    });
    await prisma.branchInventory.deleteMany({
      where: {
        productId: { in: [productId, inactiveProductId].filter(Boolean) },
      },
    });

    await prisma.inventoryClosure.deleteMany({ where: { branchId } });

    await prisma.branchInventory.create({
      data: {
        branchId,
        productId,
        quantity: STOCK_INITIAL,
        minimumStock: 5,
        expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
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

  describe("successful ADJUSTMENT_ENTRY", () => {
    it("returns the movement in the contract shape with the resulting quantity → 201", async () => {
      const response = await postAdjustment(
        validEntryPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(adjustmentOf(response.body)).toMatchObject({
        id: expect.any(String),
        movementType: "ADJUSTMENT_ENTRY",
        quantity: 5,
        expirationDate: EXP_DATE,
        product: { id: productId },
        branch: { id: branchId },
        originBranch: null,
        user: { id: actorIds.SUPERADMIN },
        observation: DEFAULT_REASON,
        resultingQuantity: STOCK_INITIAL + 5,
      });
    });

    it("increments the lot with the same expiration", async () => {
      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);

      expect(await lotQuantity(EXP_DATE)).toBe(STOCK_INITIAL + 5);
    });

    it("creates the lot with the branch minimum when it is new", async () => {
      await postAdjustment(
        validEntryPayload({ expirationDate: NEW_LOT_DATE }),
        tokens.SUPERADMIN,
      ).expect(201);

      const lot = await prisma!.branchInventory.findFirst({
        where: {
          branchId,
          productId,
          expirationDate: new Date(`${NEW_LOT_DATE}T00:00:00.000Z`),
        },
      });
      expect(lot).toMatchObject({ quantity: 5, minimumStock: 5 });
    });

    it("records the movement with the lot and the reason as observation", async () => {
      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);

      const movement = await prisma!.inventoryMovement.findFirst({
        where: { branchId, productId },
      });
      expect(movement).toMatchObject({
        movementType: "ADJUSTMENT_ENTRY",
        quantity: 5,
        observation: DEFAULT_REASON,
        expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
      });
    });

    it("records an INVENTORY_ADJUSTMENT audit log with the reason", async () => {
      const response = await postAdjustment(
        validEntryPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      const log = await prisma!.auditLog.findFirst({
        where: { entityId: adjustmentOf(response.body).id },
      });
      expect(log).toMatchObject({
        action: "INVENTORY_ADJUSTMENT",
        entity: "INVENTORY_MOVEMENT",
        reason: DEFAULT_REASON,
        userId: actorIds.SUPERADMIN,
      });
    });
  });

  describe("successful ADJUSTMENT_EXIT", () => {
    it("decrements the lot and returns the resulting quantity", async () => {
      const response = await postAdjustment(
        validExitPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(adjustmentOf(response.body)).toMatchObject({
        movementType: "ADJUSTMENT_EXIT",
        resultingQuantity: STOCK_INITIAL - 5,
      });
      expect(await lotQuantity(EXP_DATE)).toBe(STOCK_INITIAL - 5);
    });

    it("uses the earliest current lot when no lot is sent", async () => {
      const response = await postAdjustment(
        validExitPayload({ expirationDate: undefined }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(adjustmentOf(response.body).expirationDate).toBe(EXP_DATE);
    });

    it("is allowed after the day was closed and is audited as POST_CLOSURE_ADJUSTMENT", async () => {
      await prisma!.inventoryClosure.create({
        data: {
          branchId,
          closureDate: businessDate(),
          status: "CONFIRMED",
          confirmed: true,
          locked: true,
        },
      });

      const response = await postAdjustment(
        validExitPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      const log = await prisma!.auditLog.findFirst({
        where: { entityId: adjustmentOf(response.body).id },
      });
      expect(log?.action).toBe("POST_CLOSURE_ADJUSTMENT");
    });
  });

  describe("DTO validation", () => {
    it.each([
      ["a missing branchId", { branchId: undefined }],
      ["a non-UUID branchId", { branchId: "not-a-uuid" }],
      ["a missing movementType", { movementType: undefined }],
      ["a manual EXIT movementType", { movementType: "EXIT" }],
      ["a missing reason", { reason: undefined }],
      ["a reason shorter than 10 characters", { reason: "Conteo" }],
      ["the old items array", { items: [] }],
      ["quantity < 1", { quantity: 0 }],
      ["an invalid expirationDate format", { expirationDate: "2027/12/31" }],
      ["a non-UUID productId", { productId: "whey" }],
    ])("rejects %s → 400", async (_label, overrides) => {
      await postAdjustment(
        validEntryPayload(overrides),
        tokens.SUPERADMIN,
      ).expect(400);
    });
  });

  describe("business rules", () => {
    const expectError = async (
      body: Record<string, unknown>,
      status: number,
      code: string,
    ) => {
      const response = await postAdjustment(body, tokens.SUPERADMIN).expect(
        status,
      );
      expect(errorOf(response.body).code).toBe(code);
    };

    it("returns 404 BRANCH_NOT_FOUND when the branch does not exist", async () => {
      await expectError(
        validEntryPayload({ branchId: randomUUID() }),
        404,
        "BRANCH_NOT_FOUND",
      );
    });

    it("returns 422 BRANCH_INACTIVE when the branch is inactive", async () => {
      await expectError(
        validEntryPayload({ branchId: inactiveBranchId }),
        422,
        "BRANCH_INACTIVE",
      );
    });

    it("returns 404 PRODUCT_NOT_FOUND when the product does not exist", async () => {
      await expectError(
        validEntryPayload({ productId: randomUUID() }),
        404,
        "PRODUCT_NOT_FOUND",
      );
    });

    it("returns 422 PRODUCT_INACTIVE when the product is inactive", async () => {
      await expectError(
        validEntryPayload({ productId: inactiveProductId }),
        422,
        "PRODUCT_INACTIVE",
      );
    });

    it("returns 404 PRODUCT_NOT_ASSIGNED when the branch never had the product", async () => {
      await expectError(
        validEntryPayload({ branchId: otherBranchId }),
        404,
        "PRODUCT_NOT_ASSIGNED",
      );
    });

    it("returns 404 LOT_NOT_FOUND on ADJUSTMENT_EXIT for a lot the branch does not have", async () => {
      await expectError(
        validExitPayload({ expirationDate: NEW_LOT_DATE }),
        404,
        "LOT_NOT_FOUND",
      );
    });

    it("returns 422 INSUFFICIENT_STOCK and keeps the stock untouched", async () => {
      await expectError(
        validExitPayload({ quantity: STOCK_INITIAL + 1 }),
        422,
        "INSUFFICIENT_STOCK",
      );

      expect(await lotQuantity(EXP_DATE)).toBe(STOCK_INITIAL);
      expect(
        await prisma!.inventoryMovement.count({ where: { productId } }),
      ).toBe(0);
    });
  });

  describe("role access", () => {
    it("allows SUPERADMIN → 201", async () => {
      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);
    });

    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
      "returns 403 INSUFFICIENT_PERMISSIONS for %s, since only SUPERADMIN adjusts",
      async (roleName) => {
        const response = await postAdjustment(
          validEntryPayload(),
          tokens[roleName],
        ).expect(403);
        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      },
    );

    it("returns 401 when no token is provided", async () => {
      await postAdjustment(validEntryPayload()).expect(401);
    });
  });
});
