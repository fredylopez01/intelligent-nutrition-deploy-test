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

interface MovementResponse {
  data: {
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
    originResultingQuantity: number;
  };
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-TR-${runId}`;
const EXP_DATE = "2027-12-31";
const LATER_EXP_DATE = "2028-06-30";
const EXPIRED_DATE = "2026-01-31";
const STOCK_INITIAL = 50;

const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const transferOf = (body: unknown) => (body as MovementResponse).data;
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
    branchId: destinationBranchId,
    productId,
    quantity: 3,
    expirationDate: EXP_DATE,
    ...overrides,
  });

  const lotQuantity = async (branchId: string, expirationDate: string) =>
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

    await prisma.inventoryClosure.deleteMany({
      where: { branchId: { in: [originBranchId, destinationBranchId] } },
    });

    // Origin: an expired lot and a current lot. Destination: the product is
    // assigned with a later lot, so a transfer of EXP_DATE creates a new lot.
    await prisma.branchInventory.createMany({
      data: [
        {
          branchId: originBranchId,
          productId,
          quantity: 4,
          minimumStock: 5,
          expirationDate: new Date(`${EXPIRED_DATE}T00:00:00.000Z`),
        },
        {
          branchId: originBranchId,
          productId,
          quantity: STOCK_INITIAL,
          minimumStock: 5,
          expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
        },
        {
          branchId: destinationBranchId,
          productId,
          quantity: 1,
          minimumStock: 7,
          expirationDate: new Date(`${LATER_EXP_DATE}T00:00:00.000Z`),
        },
      ],
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

  describe("successful transfer", () => {
    it("returns the movement with both branches and the resulting quantities → 201", async () => {
      const response = await postTransfer(
        validPayload({ observation: "Reposición sede destino" }),
        tokens.SUPERADMIN,
      ).expect(201);

      const transfer = transferOf(response.body);
      expect(transfer).toMatchObject({
        id: expect.any(String),
        movementType: "TRANSFER",
        quantity: 3,
        expirationDate: EXP_DATE,
        product: { id: productId, referenceCode: `TR-${runId}` },
        branch: { id: destinationBranchId },
        originBranch: { id: originBranchId },
        user: { id: actorIds.SUPERADMIN, fullName: "SUPERADMIN E2E-TR" },
        observation: "Reposición sede destino",
        saleId: null,
        purchaseId: null,
        resultingQuantity: 1 + 3,
        originResultingQuantity: 4 + STOCK_INITIAL - 3,
      });
    });

    it("moves the units from the origin lot into a new destination lot with the destination minimum", async () => {
      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);

      expect(await lotQuantity(originBranchId, EXP_DATE)).toBe(
        STOCK_INITIAL - 3,
      );
      const destination = await prisma!.branchInventory.findFirst({
        where: {
          branchId: destinationBranchId,
          productId,
          expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
        },
      });
      expect(destination).toMatchObject({ quantity: 3, minimumStock: 7 });
    });

    it("adds to the destination lot with the same expiration", async () => {
      await prisma!.branchInventory.create({
        data: {
          branchId: originBranchId,
          productId,
          quantity: 10,
          minimumStock: 5,
          expirationDate: new Date(`${LATER_EXP_DATE}T00:00:00.000Z`),
        },
      });

      await postTransfer(
        validPayload({ expirationDate: LATER_EXP_DATE }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(await lotQuantity(destinationBranchId, LATER_EXP_DATE)).toBe(4);
      expect(await lotQuantity(originBranchId, LATER_EXP_DATE)).toBe(7);
    });

    it("takes the earliest current origin lot when no lot is sent, skipping the expired one", async () => {
      const response = await postTransfer(
        validPayload({ expirationDate: undefined }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(transferOf(response.body).expirationDate).toBe(EXP_DATE);
      expect(await lotQuantity(originBranchId, EXPIRED_DATE)).toBe(4);
    });

    it("creates a single TRANSFER movement that keeps the lot", async () => {
      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);

      const movements = await prisma!.inventoryMovement.findMany({
        where: { productId },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        movementType: "TRANSFER",
        quantity: 3,
        branchId: destinationBranchId,
        originBranchId,
        userId: actorIds.SUPERADMIN,
        expirationDate: new Date(`${EXP_DATE}T00:00:00.000Z`),
      });
    });

    it("does not write an audit log, since the movement already traces it", async () => {
      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);

      const logs = await prisma!.auditLog.count({
        where: { userId: actorIds.SUPERADMIN },
      });
      expect(logs).toBe(0);
    });
  });

  describe("DTO validation", () => {
    it.each([
      ["a missing originBranchId", { originBranchId: undefined }],
      ["a missing destination branchId", { branchId: undefined }],
      ["a non-UUID originBranchId", { originBranchId: "not-a-uuid" }],
      ["the old items array", { items: [] }],
      ["quantity < 1", { quantity: 0 }],
      ["an invalid expirationDate format", { expirationDate: "31/12/2027" }],
    ])("rejects %s → 400", async (_label, overrides) => {
      await postTransfer(validPayload(overrides), tokens.SUPERADMIN).expect(
        400,
      );
    });
  });

  describe("business rules", () => {
    const expectError = async (
      body: Record<string, unknown>,
      status: number,
      code: string,
    ) => {
      const response = await postTransfer(
        validPayload(body),
        tokens.SUPERADMIN,
      ).expect(status);
      expect(errorOf(response.body).code).toBe(code);
    };

    it("returns 422 SAME_BRANCH_TRANSFER when origin and destination are the same", async () => {
      await expectError(
        { branchId: originBranchId },
        422,
        "SAME_BRANCH_TRANSFER",
      );
    });

    it("returns 404 BRANCH_NOT_FOUND when a branch does not exist", async () => {
      await expectError({ branchId: randomUUID() }, 404, "BRANCH_NOT_FOUND");
    });

    it("returns 422 BRANCH_INACTIVE when the destination branch is inactive", async () => {
      await expectError({ branchId: inactiveBranchId }, 422, "BRANCH_INACTIVE");
    });

    it("returns 404 PRODUCT_NOT_FOUND when the product does not exist", async () => {
      await expectError({ productId: randomUUID() }, 404, "PRODUCT_NOT_FOUND");
    });

    it("returns 422 PRODUCT_INACTIVE when the product is inactive", async () => {
      await expectError(
        { productId: inactiveProductId },
        422,
        "PRODUCT_INACTIVE",
      );
    });

    it("returns 404 PRODUCT_NOT_ASSIGNED_IN_DESTINATION and does not create the product there", async () => {
      await prisma!.branchInventory.deleteMany({
        where: { branchId: destinationBranchId, productId },
      });

      await expectError({}, 404, "PRODUCT_NOT_ASSIGNED_IN_DESTINATION");
      expect(await lotQuantity(destinationBranchId, EXP_DATE)).toBeNull();
      expect(await lotQuantity(originBranchId, EXP_DATE)).toBe(STOCK_INITIAL);
    });

    it("returns 404 LOT_NOT_FOUND when the origin has no lot with that expirationDate", async () => {
      await expectError({ expirationDate: "2029-01-01" }, 404, "LOT_NOT_FOUND");
    });

    it("returns 422 LOT_EXPIRED for an expired lot", async () => {
      await expectError({ expirationDate: EXPIRED_DATE }, 422, "LOT_EXPIRED");
    });

    it("returns 422 INSUFFICIENT_STOCK and keeps both branches untouched", async () => {
      await expectError(
        { quantity: STOCK_INITIAL + 1 },
        422,
        "INSUFFICIENT_STOCK",
      );

      expect(await lotQuantity(originBranchId, EXP_DATE)).toBe(STOCK_INITIAL);
      expect(await lotQuantity(destinationBranchId, EXP_DATE)).toBeNull();
      expect(
        await prisma!.inventoryMovement.count({ where: { productId } }),
      ).toBe(0);
    });

    it("returns 422 INVENTORY_CLOSED when the destination already closed the day", async () => {
      await prisma!.inventoryClosure.create({
        data: {
          branchId: destinationBranchId,
          closureDate: businessDate(),
          status: "CONFIRMED",
          confirmed: true,
          locked: true,
        },
      });

      await expectError({}, 422, "INVENTORY_CLOSED");
    });
  });

  describe("role access and scope", () => {
    it("allows SUPERADMIN to transfer between any branches → 201", async () => {
      await postTransfer(validPayload(), tokens.SUPERADMIN).expect(201);
    });

    it("allows BRANCH_LEADER to transfer from their own branch → 201", async () => {
      await postTransfer(validPayload(), tokens.BRANCH_LEADER).expect(201);
    });

    it("returns 403 BRANCH_SCOPE_VIOLATION when BRANCH_LEADER is not assigned to the origin branch", async () => {
      const response = await postTransfer(
        validPayload(),
        tokenBranchLeaderOther,
      ).expect(403);
      expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it.each<RoleName>(["BRANCH_ASSISTANT", "DEV"])(
      "returns 403 INSUFFICIENT_PERMISSIONS for %s",
      async (roleName) => {
        const response = await postTransfer(
          validPayload(),
          tokens[roleName],
        ).expect(403);
        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      },
    );

    it("returns 401 when no token is provided", async () => {
      await postTransfer(validPayload()).expect(401);
    });
  });
});
