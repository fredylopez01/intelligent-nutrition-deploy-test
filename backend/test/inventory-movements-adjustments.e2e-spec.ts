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

interface AdjustmentResponseItem {
  id: string;
  productId: string;
  productName: string;
  referenceCode: string;
  unit: string;
  quantity: number;
  expirationDate: string;
  observation: string | null;
}

interface AdjustmentResponse {
  data: {
    branch: { id: string; name: string };
    adjustmentType: "ENTRY" | "EXIT";
    reason: string;
    items: AdjustmentResponseItem[];
  };
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-ADJ-${runId}`;
const EXP_DATE = "2027-12-31";
const STOCK_INITIAL = 50;
const DEFAULT_REASON = "Stock adjustment for testing purposes";

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
  let tokenBranchLeaderOther = "";

  const postAdjustment = (body: object, token?: string) => {
    const pending = request(app!.getHttpServer())
      .post("/api/v1/inventory-movements/adjustments")
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const validEntryPayload = (overrides: Record<string, unknown> = {}) => ({
    branchId,
    adjustmentType: "ENTRY",
    reason: DEFAULT_REASON,
    items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
    ...overrides,
  });

  const validExitPayload = (overrides: Record<string, unknown> = {}) => ({
    branchId,
    adjustmentType: "EXIT",
    reason: DEFAULT_REASON,
    items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
    ...overrides,
  });

  const branchStock = () =>
    prisma!.branchInventory.findFirst({
      where: { branchId, productId },
      select: { quantity: true },
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
            create: { roleId: role.id, active: true, mustChangePassword: false },
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
    tokenBranchLeaderOther = await jwtService.signAsync({
      sub: branchLeaderOtherPerson.id,
    });

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

    // Seed stock for EXIT tests; ENTRY tests that need a fresh start delete this lot first
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
      const branchIds = [branchId, inactiveBranchId, otherBranchId].filter(Boolean);

      await prisma.inventoryMovement.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: { in: personIds } },
            { entity: "INVENTORY_ADJUSTMENT" },
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

  // ─────────────────────────────────────────────────────────────────────────────
  // ENTRY adjustment
  // ─────────────────────────────────────────────────────────────────────────────

  describe("successful ENTRY adjustment", () => {
    it("returns branch/adjustmentType/reason/items shape → 201", async () => {
      const response = await postAdjustment(
        validEntryPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      const body = adjustmentOf(response.body);
      expect(body.branch.id).toBe(branchId);
      expect(body.adjustmentType).toBe("ENTRY");
      expect(body.reason).toBe(DEFAULT_REASON);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        id: expect.any(String),
        productId,
        productName: expect.any(String),
        referenceCode: `ADJ-${runId}`,
        unit: expect.any(String),
        quantity: 5,
        expirationDate: EXP_DATE,
      });
    });

    it("creates a new lot when the product has no existing inventory in the branch", async () => {
      await prisma!.branchInventory.deleteMany({ where: { branchId, productId } });
      const before = await branchStock();
      expect(before).toBeNull();

      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);

      const after = await branchStock();
      expect(after).not.toBeNull();
      expect(after!.quantity).toBe(5);
    });

    it("increments an existing lot when the product already has inventory", async () => {
      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);

      const after = await branchStock();
      expect(after!.quantity).toBe(STOCK_INITIAL + 5);
    });

    it("creates one InventoryMovement per item with type ADJUSTMENT_ENTRY", async () => {
      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);

      const movement = await prisma!.inventoryMovement.findFirst({
        where: { branchId, productId },
      });
      expect(movement).not.toBeNull();
      expect(movement!.movementType).toBe("ADJUSTMENT_ENTRY");
      expect(movement!.quantity).toBe(5);
      expect(movement!.originBranchId).toBeNull();
    });

    it("records an audit log with entity INVENTORY_ADJUSTMENT and action CREATE", async () => {
      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);

      const log = await prisma!.auditLog.findFirst({
        where: { entity: "INVENTORY_ADJUSTMENT", userId: actorIds.SUPERADMIN },
      });
      expect(log).not.toBeNull();
      expect(log!.action).toBe("CREATE");
    });

    it("accepts an optional observation per item", async () => {
      const response = await postAdjustment(
        validEntryPayload({
          items: [
            {
              productId,
              quantity: 2,
              expirationDate: EXP_DATE,
              observation: "Found extra units",
            },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(adjustmentOf(response.body).items[0].observation).toBe(
        "Found extra units",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EXIT adjustment
  // ─────────────────────────────────────────────────────────────────────────────

  describe("successful EXIT adjustment", () => {
    it("returns branch/adjustmentType/reason/items shape → 201", async () => {
      const response = await postAdjustment(
        validExitPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      const body = adjustmentOf(response.body);
      expect(body.branch.id).toBe(branchId);
      expect(body.adjustmentType).toBe("EXIT");
      expect(body.reason).toBe(DEFAULT_REASON);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].quantity).toBe(5);
    });

    it("decrements the existing lot by the requested quantity", async () => {
      await postAdjustment(validExitPayload(), tokens.SUPERADMIN).expect(201);

      const after = await branchStock();
      expect(after!.quantity).toBe(STOCK_INITIAL - 5);
    });

    it("creates one InventoryMovement per item with type ADJUSTMENT_EXIT", async () => {
      await postAdjustment(validExitPayload(), tokens.SUPERADMIN).expect(201);

      const movement = await prisma!.inventoryMovement.findFirst({
        where: { branchId, productId },
      });
      expect(movement).not.toBeNull();
      expect(movement!.movementType).toBe("ADJUSTMENT_EXIT");
      expect(movement!.quantity).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DTO validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe("DTO validation", () => {
    it("rejects a missing branchId → 400", async () => {
      const { branchId: _b, ...body } = validEntryPayload();
      const response = await postAdjustment(body, tokens.SUPERADMIN).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a non-UUID branchId → 400", async () => {
      const response = await postAdjustment(
        validEntryPayload({ branchId: "not-a-uuid" }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a missing adjustmentType → 400", async () => {
      const { adjustmentType: _at, ...body } = validEntryPayload();
      const response = await postAdjustment(body, tokens.SUPERADMIN).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects an invalid adjustmentType → 400", async () => {
      const response = await postAdjustment(
        validEntryPayload({ adjustmentType: "TRANSFER" }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a missing reason → 400", async () => {
      const { reason: _r, ...body } = validEntryPayload();
      const response = await postAdjustment(body, tokens.SUPERADMIN).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a reason shorter than 3 characters → 400", async () => {
      const response = await postAdjustment(
        validEntryPayload({ reason: "AB" }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects an empty items array → 400", async () => {
      const response = await postAdjustment(
        validEntryPayload({ items: [] }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects quantity < 1 → 400", async () => {
      const response = await postAdjustment(
        validEntryPayload({
          items: [{ productId, quantity: 0, expirationDate: EXP_DATE }],
        }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
      expect(errorOf(response.body).details).toEqual(
        expect.arrayContaining([expect.stringContaining("quantity")]),
      );
    });

    it("rejects an invalid expirationDate format → 400", async () => {
      const response = await postAdjustment(
        validEntryPayload({
          items: [{ productId, quantity: 5, expirationDate: "31/12/2027" }],
        }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a non-UUID productId in items → 400", async () => {
      const response = await postAdjustment(
        validEntryPayload({
          items: [
            { productId: "not-a-uuid", quantity: 5, expirationDate: EXP_DATE },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Business rules
  // ─────────────────────────────────────────────────────────────────────────────

  describe("business rules", () => {
    it("returns 422 DUPLICATED_ITEM when items share productId + expirationDate", async () => {
      const response = await postAdjustment(
        validEntryPayload({
          items: [
            { productId, quantity: 2, expirationDate: EXP_DATE },
            { productId, quantity: 3, expirationDate: EXP_DATE },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("DUPLICATED_ITEM");
    });

    it("returns 404 BRANCH_NOT_FOUND when the branch does not exist", async () => {
      const response = await postAdjustment(
        validEntryPayload({ branchId: randomUUID() }),
        tokens.SUPERADMIN,
      ).expect(404);
      expect(errorOf(response.body).code).toBe("BRANCH_NOT_FOUND");
    });

    it("returns 422 BRANCH_INACTIVE when the branch is inactive", async () => {
      const response = await postAdjustment(
        validEntryPayload({ branchId: inactiveBranchId }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("BRANCH_INACTIVE");
    });

    it("returns 404 PRODUCT_NOT_FOUND when the product does not exist", async () => {
      const response = await postAdjustment(
        validEntryPayload({
          items: [
            { productId: randomUUID(), quantity: 5, expirationDate: EXP_DATE },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(404);
      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
    });

    it("returns 422 PRODUCT_INACTIVE when the product is inactive", async () => {
      const response = await postAdjustment(
        validEntryPayload({
          items: [
            {
              productId: inactiveProductId,
              quantity: 5,
              expirationDate: EXP_DATE,
            },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("PRODUCT_INACTIVE");
    });

    it("returns 422 LOT_NOT_FOUND on EXIT when there is no lot with that expirationDate", async () => {
      const response = await postAdjustment(
        validExitPayload({
          items: [{ productId, quantity: 5, expirationDate: "2099-01-01" }],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("LOT_NOT_FOUND");
    });

    it("returns 422 INSUFFICIENT_STOCK on EXIT when requested quantity exceeds available stock", async () => {
      const response = await postAdjustment(
        validExitPayload({
          items: [{ productId, quantity: STOCK_INITIAL + 1, expirationDate: EXP_DATE }],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("INSUFFICIENT_STOCK");
    });

    it("does not modify stock when EXIT fails validation (atomicity)", async () => {
      const before = await branchStock();

      await postAdjustment(
        validExitPayload({
          items: [{ productId, quantity: STOCK_INITIAL + 1, expirationDate: EXP_DATE }],
        }),
        tokens.SUPERADMIN,
      ).expect(422);

      const after = await branchStock();
      expect(after!.quantity).toBe(before!.quantity);
    });

    it("ENTRY does not require an existing lot — succeeds with no prior inventory", async () => {
      await prisma!.branchInventory.deleteMany({ where: { branchId, productId } });

      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Role access and scope
  // ─────────────────────────────────────────────────────────────────────────────

  describe("role access and scope", () => {
    it("allows SUPERADMIN to adjust any branch → 201", async () => {
      await postAdjustment(validEntryPayload(), tokens.SUPERADMIN).expect(201);
    });

    it("allows BRANCH_LEADER to adjust their assigned branch → 201", async () => {
      await postAdjustment(validEntryPayload(), tokens.BRANCH_LEADER).expect(201);
    });

    it("returns 403 FORBIDDEN_BRANCH when BRANCH_LEADER is not assigned to the branch", async () => {
      const response = await postAdjustment(
        validEntryPayload(),
        tokenBranchLeaderOther,
      ).expect(403);
      expect(errorOf(response.body).code).toBe("FORBIDDEN_BRANCH");
    });

    it("returns 403 when BRANCH_ASSISTANT attempts an adjustment", async () => {
      const response = await postAdjustment(
        validEntryPayload(),
        tokens.BRANCH_ASSISTANT,
      ).expect(403);
      expect(errorOf(response.body).code).toMatch(
        /FORBIDDEN|INSUFFICIENT_PERMISSIONS/,
      );
    });

    it("allows DEV to adjust any branch → 201", async () => {
      await postAdjustment(validEntryPayload(), tokens.DEV).expect(201);
    });

    it("returns 401 when no token is provided", async () => {
      await postAdjustment(validEntryPayload()).expect(401);
    });
  });
});
