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

interface AssignedLotData {
  id: string;
  branchId: string;
  product: {
    id: string;
    name: string;
    referenceCode: string;
    category: { id: string; name: string };
    unitOfMeasure: { abbreviation: string };
    price: string;
    active: boolean;
  };
  quantity: number;
  minimumStock: number;
  lowStock: boolean;
  expirationDate: string;
  updatedAt: string;
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-AI-${runId}`;
const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const lotOf = (body: unknown): AssignedLotData => {
  const outer = (body as { data: Record<string, unknown> }).data;
  return ("data" in outer ? outer.data : outer) as AssignedLotData;
};

const errorOf = (body: unknown) => (body as ApiErrorBody).error;

describe("POST /api/v1/branches/:branchId/inventory (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let documentTypeId = "";
  let categoryId = "";
  let unitOfMeasureId = "";
  let productId = "";
  let inactiveProductId = "";
  let branchId = "";
  let otherBranchId = "";
  let inactiveBranchId = "";
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;

  const postAssign = (
    targetBranchId: string,
    body: object,
    token?: string,
  ) => {
    const pending = request(app!.getHttpServer())
      .post(`/api/v1/branches/${targetBranchId}/inventory`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    productId,
    quantity: 20,
    minimumStock: 5,
    expirationDate: "2027-12-31T00:00:00.000Z",
    ...overrides,
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
        data: { code: DOCUMENT_CODE, name: "Document (e2e assign inventory)" },
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
          email: `${roleName.toLowerCase()}.assign-inv.${runId}@e2e.test`,
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
        name: `${runId} Assign Branch`,
        address: "Calle 1 # 2-3",
        phone: "3001112233",
        active: true,
      },
    });
    branchId = branch.id;

    const otherBranch = await database.branch.create({
      data: {
        name: `${runId} Other Assign Branch`,
        address: "Calle 4 # 5-6",
        phone: "3001112244",
        active: true,
      },
    });
    otherBranchId = otherBranch.id;

    const inactiveBranch = await database.branch.create({
      data: {
        name: `${runId} Inactive Assign Branch`,
        address: "Calle 7 # 8-9",
        phone: "3001112255",
        active: false,
      },
    });
    inactiveBranchId = inactiveBranch.id;

    // BRANCH_LEADER is only assigned to `branchId`, not to `otherBranchId`
    await database.userBranch.create({
      data: {
        userId: actorIds.BRANCH_LEADER,
        branchId,
        assignmentDate: new Date(),
        active: true,
      },
    });

    const category = await database.category.create({
      data: { name: `${runId} Assign Category`, active: true },
    });
    categoryId = category.id;

    const unitOfMeasure = await database.unitMeasure.create({
      data: {
        name: `${runId} Assign Unit`,
        abreviation: `AI${runId.slice(-7)}`,
        active: true,
      },
    });
    unitOfMeasureId = unitOfMeasure.id;

    productId = (
      await database.product.create({
        data: {
          name: `${runId} Assign Product`,
          referenceCode: `AI-${runId}`,
          categoryId,
          unitOfMeasureId,
          price: "12500.00",
          active: true,
        },
      })
    ).id;

    inactiveProductId = (
      await database.product.create({
        data: {
          name: `${runId} Inactive Assign Product`,
          referenceCode: `AII-${runId}`,
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

    const inventoryRecords = await prisma.branchInventory.findMany({
      where: { productId: { in: productIds } },
      select: { id: true },
    });
    const inventoryIds = inventoryRecords.map((r) => r.id);

    await prisma.inventoryMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    if (inventoryIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: inventoryIds } },
      });
    }
    await prisma.branchInventory.deleteMany({
      where: { productId: { in: productIds } },
    });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        const productIds = [productId, inactiveProductId].filter(Boolean);
        const branchIds = [branchId, otherBranchId, inactiveBranchId].filter(
          Boolean,
        );

        const inventoryRecords = await prisma.branchInventory.findMany({
          where: { productId: { in: productIds } },
          select: { id: true },
        });
        const inventoryIds = inventoryRecords.map((r) => r.id);

        await prisma.inventoryMovement.deleteMany({
          where: { productId: { in: productIds } },
        });
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { entityId: { in: inventoryIds } },
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
        await prisma.product.deleteMany({
          where: { id: { in: productIds } },
        });
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

  describe("successful assignment", () => {
    it("assigns an active product to an active branch and returns the lot", async () => {
      const response = await postAssign(
        branchId,
        validPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      const lot = lotOf(response.body);
      expect(lot).toMatchObject({
        id: expect.any(String),
        branchId,
        product: {
          id: productId,
          referenceCode: `AI-${runId}`,
          category: { id: categoryId },
          unitOfMeasure: { abbreviation: expect.any(String) },
          price: "12500.00",
          active: true,
        },
        quantity: 20,
        minimumStock: 5,
        lowStock: false,
        expirationDate: expect.any(String),
        updatedAt: expect.any(String),
      });

      const persisted = await prisma!.branchInventory.findFirst({
        where: { branchId, productId },
      });
      expect(persisted).not.toBeNull();
      expect(persisted!.quantity).toBe(20);
      expect(persisted!.minimumStock).toBe(5);
    });

    it("creates an inventory movement of type TRANSFER when quantity is greater than zero", async () => {
      await postAssign(
        branchId,
        validPayload({ quantity: 10 }),
        tokens.SUPERADMIN,
      ).expect(201);

      const movement = await prisma!.inventoryMovement.findFirst({
        where: { branchId, productId },
      });
      expect(movement).not.toBeNull();
      expect(movement!.movementType).toBe("TRANSFER");
      expect(movement!.quantity).toBe(10);
    });

    it("does not create an inventory movement when quantity is zero", async () => {
      await postAssign(
        branchId,
        validPayload({ quantity: 0 }),
        tokens.SUPERADMIN,
      ).expect(201);

      const movement = await prisma!.inventoryMovement.findFirst({
        where: { branchId, productId },
      });
      expect(movement).toBeNull();
    });

    it("inherits the minimum stock from the existing lot when adding a second lot", async () => {
      await prisma!.branchInventory.create({
        data: {
          branchId,
          productId,
          quantity: 15,
          minimumStock: 8,
          expirationDate: new Date("2027-06-30T00:00:00.000Z"),
        },
      });

      // dto.minimumStock = 5 should be ignored; service must inherit 8 from existing lot
      const response = await postAssign(
        branchId,
        validPayload({ minimumStock: 5, expirationDate: "2027-12-31T00:00:00.000Z" }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(lotOf(response.body).minimumStock).toBe(8);
    });

    it("reports lowStock true when total quantity is below minimum stock", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ quantity: 2, minimumStock: 10 }),
        tokens.SUPERADMIN,
      ).expect(201);

      expect(lotOf(response.body).lowStock).toBe(true);
    });

    it("records an audit log with action ASSIGN and the inventory id as entityId", async () => {
      const response = await postAssign(
        branchId,
        validPayload(),
        tokens.SUPERADMIN,
      ).expect(201);

      const lot = lotOf(response.body);
      const auditLog = await prisma!.auditLog.findFirst({
        where: {
          entity: "branch_inventory",
          entityId: lot.id,
          action: "ASSIGN",
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog!.userId).toBe(actorIds.SUPERADMIN);
      expect(auditLog!.reason).toBe("Product assigned to branch");
    });
  });

  describe("validation", () => {
    it("rejects a missing productId → 400", async () => {
      const { productId: _pid, ...body } = validPayload();
      const response = await postAssign(
        branchId,
        body,
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a productId that is not a valid UUID → 400", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ productId: "not-a-uuid" }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a missing quantity → 400", async () => {
      const { quantity: _qty, ...body } = validPayload();
      const response = await postAssign(
        branchId,
        body,
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a negative quantity → 400", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ quantity: -1 }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a decimal quantity → 400", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ quantity: 2.5 }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a missing expirationDate → 400", async () => {
      const { expirationDate: _exp, ...body } = validPayload();
      const response = await postAssign(
        branchId,
        body,
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects an expirationDate that is not an ISO 8601 string → 400", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ expirationDate: "31/12/2027" }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a negative minimumStock → 400", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ minimumStock: -1 }),
        tokens.SUPERADMIN,
      ).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });
  });

  describe("business rules", () => {
    it("returns 404 BRANCH_NOT_FOUND when the branch does not exist", async () => {
      const response = await postAssign(
        randomUUID(),
        validPayload(),
        tokens.SUPERADMIN,
      ).expect(404);
      expect(errorOf(response.body).code).toBe("BRANCH_NOT_FOUND");
    });

    it("returns 422 BRANCH_INACTIVE when the branch is inactive", async () => {
      const response = await postAssign(
        inactiveBranchId,
        validPayload(),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("BRANCH_INACTIVE");
    });

    it("returns 404 PRODUCT_NOT_FOUND when the product does not exist", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ productId: randomUUID() }),
        tokens.SUPERADMIN,
      ).expect(404);
      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
    });

    it("returns 422 PRODUCT_INACTIVE when the product is inactive", async () => {
      const response = await postAssign(
        branchId,
        validPayload({ productId: inactiveProductId }),
        tokens.SUPERADMIN,
      ).expect(422);
      expect(errorOf(response.body).code).toBe("PRODUCT_INACTIVE");
    });

    it("returns 409 PRODUCT_ALREADY_ASSIGNED when the same branchId + productId + expirationDate already exists", async () => {
      await postAssign(branchId, validPayload(), tokens.SUPERADMIN).expect(201);

      const response = await postAssign(
        branchId,
        validPayload(),
        tokens.SUPERADMIN,
      ).expect(409);
      expect(errorOf(response.body).code).toBe("PRODUCT_ALREADY_ASSIGNED");
    });
  });

  describe("roles and scope", () => {
    it("allows SUPERADMIN to assign to any branch → 201", async () => {
      await postAssign(branchId, validPayload(), tokens.SUPERADMIN).expect(201);
    });

    it("allows BRANCH_LEADER to assign to their own branch → 201", async () => {
      await postAssign(branchId, validPayload(), tokens.BRANCH_LEADER).expect(
        201,
      );
    });

    it("returns 403 BRANCH_OUT_OF_SCOPE when BRANCH_LEADER targets a branch they are not assigned to", async () => {
      const response = await postAssign(
        otherBranchId,
        validPayload(),
        tokens.BRANCH_LEADER,
      ).expect(403);
      expect(errorOf(response.body).code).toBe("BRANCH_OUT_OF_SCOPE");
    });

    it("returns 403 when BRANCH_ASSISTANT tries to assign → FORBIDDEN", async () => {
      const response = await postAssign(
        branchId,
        validPayload(),
        tokens.BRANCH_ASSISTANT,
      ).expect(403);
      expect(errorOf(response.body).code).toMatch(
        /FORBIDDEN|INSUFFICIENT_PERMISSIONS/,
      );
    });

    it("returns 403 when DEV tries to assign → FORBIDDEN", async () => {
      const response = await postAssign(
        branchId,
        validPayload(),
        tokens.DEV,
      ).expect(403);
      expect(errorOf(response.body).code).toMatch(
        /FORBIDDEN|INSUFFICIENT_PERMISSIONS/,
      );
    });

    it("returns 401 when no token is provided", async () => {
      await postAssign(branchId, validPayload()).expect(401);
    });
  });
});
