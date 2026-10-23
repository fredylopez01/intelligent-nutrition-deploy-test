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

interface TransferResponseItem {
  id: string;
  productId: string;
  productName: string;
  referenceCode: string;
  unit: string;
  quantity: number;
  expirationDate: string;
  observation: string | null;
}

interface TransferResponse {
  data: {
    originBranch: { id: string; name: string };
    destinationBranch: { id: string; name: string };
    items: TransferResponseItem[];
  };
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-TR-${runId}`;
const EXP_DATE = "2027-12-31";
const STOCK_INITIAL = 50;

const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const transferOf = (body: unknown) => (body as TransferResponse).data;
const errorOf = (body: unknown) => (body as ApiErrorBody).error;

describe("POST /api/v1/inventory-movements/transfers (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;

  let documentTypeId = "";
  let categoryId = "";
  let unitOfMeasureId = "";
  let productId = "";
  let inactiveProductId = "";
  let originBranchId = "";
  let destinationBranchId = "";
  let inactiveBranchId = "";
  let branchLeaderOtherId = "";

  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;
  let tokenBranchLeaderOther = "";

  const postTransfer = (body: object, token?: string) => {
    const pending = request(app!.getHttpServer())
      .post("/api/v1/inventory-movements/transfers")
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    originBranchId,
    destinationBranchId,
    items: [
      {
        productId,
        quantity: 3,
        expirationDate: EXP_DATE,
      },
    ],
    ...overrides,
  });

  const originStock = () =>
    prisma!.branchInventory.findFirst({
      where: { branchId: originBranchId, productId },
      select: { quantity: true },
    });

  const destinationStock = () =>
    prisma!.branchInventory.findFirst({
      where: { branchId: destinationBranchId, productId },
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
        data: { code: DOCUMENT_CODE, name: "Document (e2e transfers)" },
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
          lastName: "E2E-TR",
          email: `${roleName.toLowerCase()}.transfers.${runId}@e2e.test`,
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
        lastName: "Leader-TR",
        email: `other.leader.transfers.${runId}@e2e.test`,
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

    const originBranch = await prisma.branch.create({
      data: {
        name: `${runId} Origin Branch`,
        address: "Calle 1 # 2-3",
        phone: "3001112233",
        active: true,
      },
    });
    originBranchId = originBranch.id;

    const destinationBranch = await prisma.branch.create({
      data: {
        name: `${runId} Destination Branch`,
        address: "Calle 4 # 5-6",
        phone: "3001112244",
        active: true,
      },
    });
    destinationBranchId = destinationBranch.id;

    const inactiveBranch = await prisma.branch.create({
      data: {
        name: `${runId} Inactive Branch`,
        address: "Calle 7 # 8-9",
        phone: "3001112255",
        active: false,
      },
    });
    inactiveBranchId = inactiveBranch.id;

    // BRANCH_LEADER is assigned to originBranch only
    await prisma.userBranch.create({
      data: {
        userId: actorIds.BRANCH_LEADER,
        branchId: originBranchId,
        assignmentDate: new Date(),
        active: true,
      },
    });

    // The other BRANCH_LEADER is assigned to destinationBranch only
    await prisma.userBranch.create({
      data: {
        userId: branchLeaderOtherId,
        branchId: destinationBranchId,
        assignmentDate: new Date(),
        active: true,
      },
    });

    const category = await prisma.category.create({
      data: { name: `${runId} Transfers Category`, active: true },
    });
    categoryId = category.id;

    const unitOfMeasure = await prisma.unitMeasure.create({
      data: {
        name: `${runId} Transfers Unit`,
        abreviation: `TR${runId.slice(-7)}`,
        active: true,
      },
    });
    unitOfMeasureId = unitOfMeasure.id;

    productId = (
      await prisma.product.create({
        data: {
          name: `${runId} Transfer Product`,
          referenceCode: `TR-${runId}`,
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
          name: `${runId} Inactive Transfer Product`,
          referenceCode: `TRI-${runId}`,
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

    // Seed origin stock for each test
    await prisma.branchInventory.create({
      data: {
        branchId: originBranchId,
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
      const branchIds = [
        originBranchId,
        destinationBranchId,
        inactiveBranchId,
      ].filter(Boolean);

      await prisma.inventoryMovement.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: { in: personIds } },
            { entity: "INVENTORY_TRANSFER" },
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

  describe("successful transfer", () => {
    it("transfers items, returns originBranch/destinationBranch/items shape", async () => {
      const response = await postTransfer(
        validPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      const transfer = transferOf(response.body);
      expect(transfer.originBranch.id).toBe(originBranchId);
      expect(transfer.destinationBranch.id).toBe(destinationBranchId);
      expect(transfer.items).toHaveLength(1);
      expect(transfer.items[0]).toMatchObject({
        id: expect.any(String),
        productId,
        productName: expect.any(String),
        referenceCode: `TR-${runId}`,
        unit: expect.any(String),
        quantity: 3,
        expirationDate: EXP_DATE,
      });
    });

    it("decrements origin stock and increments destination stock", async () => {
      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);

      const origin = await originStock();
      const destination = await destinationStock();
      expect(origin!.quantity).toBe(STOCK_INITIAL - 3);
      expect(destination!.quantity).toBe(3);
    });

    it("creates a destination lot when the product was not there yet", async () => {
      const before = await destinationStock();
      expect(before).toBeNull();

      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);

      const after = await destinationStock();
      expect(after).not.toBeNull();
      expect(after!.quantity).toBe(3);
    });

    it("increments an existing destination lot", async () => {
      await prisma!.branchInventory.create({
        data: {
          branchId: destinationBranchId,
          productId,
          quantity: 10,
          minimumStock: 0,
          expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
        },
      });

      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);

      const destination = await destinationStock();
      expect(destination!.quantity).toBe(10 + 3);
    });

    it("creates one InventoryMovement per transferred item with type TRANSFER", async () => {
      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);

      const movement = await prisma!.inventoryMovement.findFirst({
        where: { branchId: destinationBranchId, productId },
      });
      expect(movement).not.toBeNull();
      expect(movement!.movementType).toBe("TRANSFER");
      expect(movement!.quantity).toBe(3);
      expect(movement!.originBranchId).toBe(originBranchId);
    });

    it("records an audit log with entity INVENTORY_TRANSFER", async () => {
      await postTransfer(
        validPayload({
          items: [{ productId, quantity: 5, expirationDate: EXP_DATE }],
        }),
        tokens.SUPERADMIN,
      ).expect(201);

      const log = await prisma!.auditLog.findFirst({
        where: { entity: "INVENTORY_TRANSFER", userId: actorIds.SUPERADMIN },
      });
      expect(log).not.toBeNull();
      expect(log!.action).toBe("CREATE");
    });

    it("accepts an optional observation per item", async () => {
      const response = await postTransfer(
        validPayload({
          items: [
            {
              productId,
              quantity: 2,
              expirationDate: EXP_DATE,
              observation: "Test observation",
            },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(transferOf(response.body).items[0].observation).toBe(
        "Test observation",
      );
    });
  });

  describe("DTO validation", () => {
    it("rejects a missing originBranchId → 400", async () => {
      const { originBranchId: _ob, ...body } = validPayload();
      const response = await postTransfer(body, tokens.SUPERADMIN).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a missing destinationBranchId → 400", async () => {
      const { destinationBranchId: _db, ...body } = validPayload();
      const response = await postTransfer(body, tokens.SUPERADMIN).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a non-UUID originBranchId → 400", async () => {
      const response = await postTransfer(
        validPayload({ originBranchId: "not-a-uuid" }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects items array with zero elements → 400", async () => {
      const response = await postTransfer(
        validPayload({ items: [] }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects quantity < 1 → 400", async () => {
      const response = await postTransfer(
        validPayload({
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
      const response = await postTransfer(
        validPayload({
          items: [{ productId, quantity: 1, expirationDate: "31/12/2027" }],
        }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });
  });

  describe("business rules", () => {
    it("returns 422 SAME_BRANCH when origin and destination are the same", async () => {
      const response = await postTransfer(
        validPayload({ destinationBranchId: originBranchId }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("SAME_BRANCH");
    });

    it("returns 422 DUPLICATED_ITEM when items share productId + expirationDate", async () => {
      const response = await postTransfer(
        validPayload({
          items: [
            { productId, quantity: 1, expirationDate: EXP_DATE },
            { productId, quantity: 2, expirationDate: EXP_DATE },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("DUPLICATED_ITEM");
    });

    it("returns 404 ORIGIN_BRANCH_NOT_FOUND when origin does not exist", async () => {
      const response = await postTransfer(
        validPayload({ originBranchId: randomUUID() }),
        tokens.SUPERADMIN,
      ).expect(404);
      expect(errorOf(response.body).code).toBe("ORIGIN_BRANCH_NOT_FOUND");
    });

    it("returns 422 ORIGIN_BRANCH_INACTIVE when origin branch is inactive", async () => {
      const response = await postTransfer(
        validPayload({ originBranchId: inactiveBranchId }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("ORIGIN_BRANCH_INACTIVE");
    });

    it("returns 404 DESTINATION_BRANCH_NOT_FOUND when destination does not exist", async () => {
      const response = await postTransfer(
        validPayload({ destinationBranchId: randomUUID() }),
        tokens.SUPERADMIN,
      ).expect(404);
      expect(errorOf(response.body).code).toBe("DESTINATION_BRANCH_NOT_FOUND");
    });

    it("returns 422 DESTINATION_BRANCH_INACTIVE when destination branch is inactive", async () => {
      const response = await postTransfer(
        validPayload({ destinationBranchId: inactiveBranchId }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("DESTINATION_BRANCH_INACTIVE");
    });

    it("returns 404 PRODUCT_NOT_FOUND when the product does not exist", async () => {
      const response = await postTransfer(
        validPayload({
          items: [{ productId: randomUUID(), quantity: 1, expirationDate: EXP_DATE }],
        }),
        tokens.SUPERADMIN,
      ).expect(404);
      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
    });

    it("returns 422 PRODUCT_INACTIVE when the product is inactive", async () => {
      const response = await postTransfer(
        validPayload({
          items: [{ productId: inactiveProductId, quantity: 1, expirationDate: EXP_DATE }],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("PRODUCT_INACTIVE");
    });

    it("returns 422 LOT_NOT_FOUND when the product has no lot with that expirationDate in origin", async () => {
      const response = await postTransfer(
        validPayload({
          items: [{ productId, quantity: 1, expirationDate: "2099-01-01" }],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("LOT_NOT_FOUND");
    });

    it("returns 422 INSUFFICIENT_STOCK when requested quantity exceeds available stock", async () => {
      const response = await postTransfer(
        validPayload({
          items: [{ productId, quantity: STOCK_INITIAL + 1, expirationDate: EXP_DATE }],
        }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("INSUFFICIENT_STOCK");
    });

    it("does not modify stock when any item fails validation", async () => {
      const before = await originStock();

      await postTransfer(
        validPayload({
          items: [
            { productId, quantity: STOCK_INITIAL + 1, expirationDate: EXP_DATE },
          ],
        }),
        tokens.SUPERADMIN,
      ).expect(422);

      const after = await originStock();
      expect(after!.quantity).toBe(before!.quantity);
    });
  });

  describe("role access and scope", () => {
    it("allows SUPERADMIN to transfer between any branches → 201", async () => {
      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);
    });

    it("allows BRANCH_LEADER to transfer from their own branch → 201", async () => {
      await postTransfer(validPayload(), tokens.BRANCH_LEADER).expect(201);
    });

    it("returns 403 FORBIDDEN_BRANCH when BRANCH_LEADER is not assigned to the origin branch", async () => {
      const response = await postTransfer(
        validPayload(),
        tokenBranchLeaderOther,
      ).expect(403);
      expect(errorOf(response.body).code).toBe("FORBIDDEN_BRANCH");
    });

    it("returns 403 INSUFFICIENT_PERMISSIONS when BRANCH_ASSISTANT attempts a transfer", async () => {
      const response = await postTransfer(
        validPayload(),
        tokens.BRANCH_ASSISTANT,
      ).expect(403);
      expect(errorOf(response.body).code).toMatch(
        /FORBIDDEN|INSUFFICIENT_PERMISSIONS/,
      );
    });

    it("allows DEV to transfer between any branches → 201", async () => {
      await postTransfer(validPayload(), tokens.DEV).expect(201);
    });

    it("returns 401 when no token is provided", async () => {
      await postTransfer(validPayload()).expect(401);
    });
  });
});
