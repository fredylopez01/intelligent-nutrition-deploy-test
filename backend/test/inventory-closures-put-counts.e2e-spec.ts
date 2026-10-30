import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
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

interface ClosureItem {
  productId: string;
  productName: string;
  referenceCode: string;
  unit: string;
  expirationDate: string | null;
  physicalQuantity: number | null;
  observation: string | null;
}

interface ClosureBody {
  id: string;
  branchId: string;
  branchName: string;
  closureDate: string;
  status: string;
  confirmed: boolean;
  locked: boolean;
  closedAt: string | null;
  userName: string | null;
  countedItems: number;
  totalItems: number;
  items: ClosureItem[];
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-PUC-${runId}`;
const UNIT_ABREVIATION = `PUC${runId.slice(-5)}`;

const EXP_A1 = "2027-01-01";
const EXP_A2 = "2027-02-01";
const EXP_B = "2027-03-01";
const SYS_QTY_A1 = 3;
const SYS_QTY_A2 = 4;
const SYS_QTY_B = 5;

const at = (v: string) => new Date(`${v}T00:00:00.000Z`);
const closureOf = (body: unknown) => (body as { data: ClosureBody }).data;
const errorOf = (body: unknown) => (body as ApiError).error;

describe("PUT /api/v1/inventory-closures/:id/counts (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let productAId: string;
  let productBId: string;
  let otherBranchId: string;

  const personIds: string[] = [];
  const testBranchIds: string[] = [];
  const tokens = {} as Record<RoleName | "BRANCH_LEADER_OTHER", string>;
  const actorIds = {} as Record<RoleName, string>;
  let closureSeq = 0;

  const putCounts = (closureId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer())
      .put(`/api/v1/inventory-closures/${closureId}/counts`)
      .send(body);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  /**
   * Creates a fresh branch per call (avoids unique constraint on branchId+closureDate).
   * BRANCH_LEADER and BRANCH_ASSISTANT are assigned to every new branch unless
   * opts.unassigned is true (used for BRANCH_SCOPE_VIOLATION tests).
   */
  const createClosure = async (
    opts: {
      status?: "PENDING" | "CONFIRMED" | "NOT_CONFIRMED";
      locked?: boolean;
      unassigned?: boolean;
    } = {},
  ) => {
    closureSeq += 1;
    const branch = await prisma.branch.create({
      data: {
        name: `${runId} Cls${closureSeq}`,
        address: "Calle 1 # 2-3",
        phone: "3001112233",
        active: true,
      },
    });
    testBranchIds.push(branch.id);

    if (!opts.unassigned) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      await prisma.userBranch.createMany({
        data: [
          {
            userId: actorIds.BRANCH_LEADER,
            branchId: branch.id,
            assignmentDate: today,
            active: true,
          },
          {
            userId: actorIds.BRANCH_ASSISTANT,
            branchId: branch.id,
            assignmentDate: today,
            active: true,
          },
        ],
      });
    }

    const closure = await prisma.inventoryClosure.create({
      data: {
        branchId: branch.id,
        userId: actorIds.BRANCH_LEADER,
        closureDate: businessDate(),
        status: opts.status ?? "PENDING",
        confirmed: opts.status === "CONFIRMED",
        locked: opts.locked ?? false,
        details: {
          create: [
            {
              productId: productAId,
              expirationDate: at(EXP_A1),
              systemQuantity: SYS_QTY_A1,
            },
            {
              productId: productAId,
              expirationDate: at(EXP_A2),
              systemQuantity: SYS_QTY_A2,
            },
            {
              productId: productBId,
              expirationDate: at(EXP_B),
              systemQuantity: SYS_QTY_B,
            },
          ],
        },
      },
    });
    return { closureId: closure.id, branchId: branch.id };
  };

  const detailsOf = (closureId: string) =>
    prisma.inventoryClosureDetail.findMany({
      where: { closureId },
      orderBy: { expirationDate: "asc" },
      select: {
        productId: true,
        expirationDate: true,
        physicalQuantity: true,
        difference: true,
        observation: true,
      },
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
      await prisma.documentType.upsert({
        where: { code: DOCUMENT_CODE },
        update: { active: true },
        create: { code: DOCUMENT_CODE, name: "Cédula (e2e put counts)" },
      })
    ).id;

    const roleNames: RoleName[] = [
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
      "DEV",
    ];

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
          lastName: "E2E-COUNTS",
          email: `${roleName.toLowerCase()}.counts.${runId}@e2e.test`,
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

    const blRole = await prisma.role.upsert({
      where: { name: "BRANCH_LEADER" },
      update: {},
      create: { name: "BRANCH_LEADER" },
    });
    const branchLeaderOther = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: `${runId}OTHER`,
        firstName: "OTHER",
        lastName: "E2E-COUNTS",
        email: `other.counts.${runId}@e2e.test`,
        phone: "3009998877",
        address: "Carrera 9 # 8-7",
        userAccount: {
          create: { roleId: blRole.id, active: true, mustChangePassword: false },
        },
      },
    });
    personIds.push(branchLeaderOther.id);
    tokens.BRANCH_LEADER_OTHER = await jwtService.signAsync({
      sub: branchLeaderOther.id,
    });

    otherBranchId = (
      await prisma.branch.create({
        data: {
          name: `${runId} Other`,
          address: "Calle 4 # 5-6",
          phone: "3001112244",
          active: true,
        },
      })
    ).id;
    testBranchIds.push(otherBranchId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.userBranch.create({
      data: {
        userId: branchLeaderOther.id,
        branchId: otherBranchId,
        assignmentDate: today,
        active: true,
      },
    });

    categoryId = (
      await prisma.category.create({
        data: { name: `${runId} Counts Category`, active: true },
      })
    ).id;

    unitOfMeasureId = (
      await prisma.unitMeasure.create({
        data: {
          name: `${runId} Counts Unit`,
          abreviation: UNIT_ABREVIATION,
          active: true,
        },
      })
    ).id;

    productAId = (
      await prisma.product.create({
        data: {
          name: `${runId} Product A`,
          referenceCode: `PUC-${runId}-A`,
          categoryId,
          unitOfMeasureId,
          price: "12500.00",
          active: true,
        },
      })
    ).id;

    productBId = (
      await prisma.product.create({
        data: {
          name: `${runId} Product B`,
          referenceCode: `PUC-${runId}-B`,
          categoryId,
          unitOfMeasureId,
          price: "9900.00",
          active: true,
        },
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    try {
      const closures = await prisma.inventoryClosure.findMany({
        where: { branchId: { in: testBranchIds } },
        select: { id: true },
      });
      const closureIds = closures.map(({ id }) => id);

      await prisma.inventoryClosureDetail.deleteMany({
        where: { closureId: { in: closureIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: { in: personIds } },
            { entityId: { in: closureIds } },
          ],
        },
      });
      await prisma.inventoryClosure.deleteMany({
        where: { id: { in: closureIds } },
      });
      await prisma.userBranch.deleteMany({
        where: { userId: { in: personIds } },
      });
      await prisma.branch.deleteMany({
        where: { id: { in: testBranchIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: [productAId, productBId].filter(Boolean) } },
      });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.unitMeasure.deleteMany({ where: { id: unitOfMeasureId } });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: personIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
      await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });
    } finally {
      await app.close();
    }
  }, 30000);

  // ─────────────────────────────────────────────────────────────────────────────
  // Successful count update
  // ─────────────────────────────────────────────────────────────────────────────

  describe("successful count update", () => {
    it("returns 200 with the full response shape after counting all items", async () => {
      const { closureId, branchId } = await createClosure();

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 3 },
            { productId: productAId, expirationDate: EXP_A2, physicalQuantity: 4 },
            { productId: productBId, expirationDate: EXP_B, physicalQuantity: 5 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(200);
      const body = closureOf(response.body);
      expect(body).toMatchObject({
        id: closureId,
        branchId,
        status: "PENDING",
        confirmed: false,
        locked: false,
        closedAt: null,
        countedItems: 3,
        totalItems: 3,
      });
      expect(body.closureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.branchName).toBeTruthy();
      expect(body.items).toHaveLength(3);

      const itemA1 = body.items.find(
        (i) => i.productId === productAId && i.expirationDate === EXP_A1,
      );
      expect(itemA1).toMatchObject({
        productId: productAId,
        expirationDate: EXP_A1,
        physicalQuantity: 3,
        observation: null,
      });
      expect(itemA1).toHaveProperty("systemQuantity");
      expect(itemA1).not.toHaveProperty("difference");
    });

    it("persists physicalQuantity and computes difference = physicalQuantity − systemQuantity", async () => {
      const { closureId } = await createClosure();

      await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 2 },
            { productId: productAId, expirationDate: EXP_A2, physicalQuantity: 6 },
            { productId: productBId, expirationDate: EXP_B, physicalQuantity: 5 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      const details = await detailsOf(closureId);
      const a1 = details.find(
        (d) =>
          d.productId === productAId &&
          d.expirationDate?.toISOString().startsWith("2027-01"),
      );
      const a2 = details.find(
        (d) =>
          d.productId === productAId &&
          d.expirationDate?.toISOString().startsWith("2027-02"),
      );
      expect(a1?.physicalQuantity).toBe(2);
      expect(a1?.difference).toBe(2 - SYS_QTY_A1);
      expect(a2?.physicalQuantity).toBe(6);
      expect(a2?.difference).toBe(6 - SYS_QTY_A2);
    });

    it("saves observation and reflects partial count in countedItems", async () => {
      const { closureId } = await createClosure();

      const response = await putCounts(
        closureId,
        {
          items: [
            {
              productId: productBId,
              expirationDate: EXP_B,
              physicalQuantity: 4,
              observation: "Caja con daño leve",
            },
          ],
        },
        tokens.BRANCH_ASSISTANT,
      );

      expect(response.status).toBe(200);
      const body = closureOf(response.body);
      expect(body.countedItems).toBe(1);
      expect(body.totalItems).toBe(3);

      const itemB = body.items.find((i) => i.productId === productBId);
      expect(itemB?.observation).toBe("Caja con daño leve");

      const detail = await prisma.inventoryClosureDetail.findFirst({
        where: { closureId, productId: productBId },
        select: { observation: true },
      });
      expect(detail?.observation).toBe("Caja con daño leve");
    });

    it("replaces a previous count when the same lot is re-submitted", async () => {
      const { closureId } = await createClosure();

      await putCounts(
        closureId,
        {
          items: [
            { productId: productBId, expirationDate: EXP_B, physicalQuantity: 2 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      await putCounts(
        closureId,
        {
          items: [
            {
              productId: productBId,
              expirationDate: EXP_B,
              physicalQuantity: 5,
              observation: "Conteo corregido",
            },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      const detail = await prisma.inventoryClosureDetail.findFirst({
        where: { closureId, productId: productBId },
        select: { physicalQuantity: true, observation: true },
      });
      expect(detail?.physicalQuantity).toBe(5);
      expect(detail?.observation).toBe("Conteo corregido");
    });

    it("accepts physicalQuantity = 0 as a valid count", async () => {
      const { closureId } = await createClosure();

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 0 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(200);
      const detail = await prisma.inventoryClosureDetail.findFirst({
        where: { closureId, productId: productAId, expirationDate: at(EXP_A1) },
        select: { physicalQuantity: true, difference: true },
      });
      expect(detail?.physicalQuantity).toBe(0);
      expect(detail?.difference).toBe(0 - SYS_QTY_A1);
    });

    it("shows the expected systemQuantity but no difference while the closure is PENDING", async () => {
      const { closureId } = await createClosure();

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(200);
      const body = closureOf(response.body);
      expect(JSON.stringify(body)).toContain("systemQuantity");
      expect(JSON.stringify(body)).not.toContain("difference");
      expect(body).not.toHaveProperty("totalDifferences");
    });

    it("allows BRANCH_ASSISTANT to submit counts → 200", async () => {
      const { closureId } = await createClosure();

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productBId, expirationDate: EXP_B, physicalQuantity: 5 },
          ],
        },
        tokens.BRANCH_ASSISTANT,
      );

      expect(response.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Business errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe("business errors", () => {
    it("returns 404 CLOSURE_NOT_FOUND when the closureId does not exist", async () => {
      const response = await putCounts(
        randomUUID(),
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("CLOSURE_NOT_FOUND");
    });

    it("returns 422 CLOSURE_LOCKED when the closure status is CONFIRMED", async () => {
      const { closureId } = await createClosure({
        status: "CONFIRMED",
        locked: true,
      });

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("CLOSURE_LOCKED");
    });

    it("returns 422 CLOSURE_LOCKED when locked = true even if status is PENDING", async () => {
      const { closureId } = await createClosure({ locked: true });

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("CLOSURE_LOCKED");
    });

    it("returns 422 DUPLICATED_ITEM when the same productId + expirationDate appears twice", async () => {
      const { closureId } = await createClosure();

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 2 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("DUPLICATED_ITEM");
    });

    it("returns 422 PRODUCT_NOT_IN_CLOSURE when the lot does not belong to the closure", async () => {
      const { closureId } = await createClosure();

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: "2028-01-01", physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );

      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("PRODUCT_NOT_IN_CLOSURE");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DTO validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe("DTO validation", () => {
    it("returns 400 when items array is empty", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(closureId, { items: [] }, tokens.BRANCH_LEADER);
      expect(response.status).toBe(400);
    });

    it("returns 400 when items field is missing", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(closureId, {}, tokens.BRANCH_LEADER);
      expect(response.status).toBe(400);
    });

    it("returns 400 when an item is missing productId", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(
        closureId,
        { items: [{ expirationDate: EXP_A1, physicalQuantity: 1 }] },
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when an item is missing expirationDate", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(
        closureId,
        { items: [{ productId: productAId, physicalQuantity: 1 }] },
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when an item has an invalid expirationDate format", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: "not-a-date", physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when physicalQuantity is missing", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(
        closureId,
        { items: [{ productId: productAId, expirationDate: EXP_A1 }] },
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when physicalQuantity is negative", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: -1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when observation exceeds 500 characters", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(
        closureId,
        {
          items: [
            {
              productId: productAId,
              expirationDate: EXP_A1,
              physicalQuantity: 1,
              observation: "A".repeat(501),
            },
          ],
        },
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when closureId is not a valid UUID", async () => {
      const response = await putCounts(
        "not-a-uuid",
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER,
      );
      expect(response.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Authorization
  // ─────────────────────────────────────────────────────────────────────────────

  describe("authorization", () => {
    it("returns 401 when no token is provided", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(closureId, {
        items: [
          { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
        ],
      });
      expect(response.status).toBe(401);
    });

    it("allows SUPERADMIN to submit counts → 200", async () => {
      const { closureId } = await createClosure();
      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
          ],
        },
        tokens.SUPERADMIN,
      );
      expect(response.status).toBe(200);
    });

    it.each<RoleName>(["DEV"])(
      "returns 403 for %s role",
      async (roleName) => {
        const { closureId } = await createClosure();
        const response = await putCounts(
          closureId,
          {
            items: [
              { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
            ],
          },
          tokens[roleName],
        );
        expect(response.status).toBe(403);
        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      },
    );

    it("returns 403 BRANCH_SCOPE_VIOLATION when the leader belongs to a different branch", async () => {
      const { closureId } = await createClosure({ unassigned: true });

      const response = await putCounts(
        closureId,
        {
          items: [
            { productId: productAId, expirationDate: EXP_A1, physicalQuantity: 1 },
          ],
        },
        tokens.BRANCH_LEADER_OTHER,
      );

      expect(response.status).toBe(403);
      expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
    });
  });
});
