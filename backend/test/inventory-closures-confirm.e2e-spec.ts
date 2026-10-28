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
  expirationDate: string | null;
  physicalQuantity: number | null;
  observation: string | null;
  systemQuantity?: number;
  difference?: number | null;
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
  totalDifferences?: number;
  items: ClosureItem[];
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-CFM-${runId}`;
const UNIT_ABREVIATION = `CFM${runId.slice(-5)}`;

const EXP_A = "2027-04-01";
const EXP_B = "2027-05-01";
const SYS_QTY_A = 10;
const SYS_QTY_B = 5;
const PHY_QTY_A = 8;
const PHY_QTY_B = 5;

const at = (v: string) => new Date(`${v}T00:00:00.000Z`);
const closureOf = (body: unknown) => (body as { data: ClosureBody }).data;
const errorOf = (body: unknown) => (body as ApiError).error;

describe("POST /api/v1/inventory-closures/:id/confirm (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let productAId: string;
  let productBId: string;

  const personIds: string[] = [];
  const testBranchIds: string[] = [];
  const tokens = {} as Record<RoleName | "BRANCH_LEADER_OTHER", string>;
  const actorIds = {} as Record<RoleName, string>;
  let closureSeq = 0;

  const confirm = (closureId: string, token?: string) => {
    const pending = request(app.getHttpServer()).post(
      `/api/v1/inventory-closures/${closureId}/confirm`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  /**
   * Creates a fresh branch + closure per call.
   * allCounted: if true, sets physicalQuantity for all details (closure is ready to confirm).
   * partialCounted: if true, counts only product A, leaving product B uncounted.
   * unassigned: branch won't have BRANCH_LEADER/BRANCH_ASSISTANT assigned.
   */
  const createClosure = async (opts: {
    status?: "PENDING" | "CONFIRMED" | "NOT_CONFIRMED";
    locked?: boolean;
    allCounted?: boolean;
    partialCounted?: boolean;
    unassigned?: boolean;
  } = {}) => {
    closureSeq += 1;
    const branch = await prisma.branch.create({
      data: {
        name: `${runId} Cfm${closureSeq}`,
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
              expirationDate: at(EXP_A),
              systemQuantity: SYS_QTY_A,
              ...(opts.allCounted || opts.partialCounted
                ? {
                    physicalQuantity: PHY_QTY_A,
                    difference: PHY_QTY_A - SYS_QTY_A,
                  }
                : {}),
            },
            {
              productId: productBId,
              expirationDate: at(EXP_B),
              systemQuantity: SYS_QTY_B,
              ...(opts.allCounted
                ? {
                    physicalQuantity: PHY_QTY_B,
                    difference: PHY_QTY_B - SYS_QTY_B,
                  }
                : {}),
            },
          ],
        },
      },
    });
    return { closureId: closure.id, branchId: branch.id };
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
      await prisma.documentType.upsert({
        where: { code: DOCUMENT_CODE },
        update: { active: true },
        create: { code: DOCUMENT_CODE, name: "Cedula (e2e confirm closure)" },
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
          lastName: "E2E-CFM",
          email: `${roleName.toLowerCase()}.cfm.${runId}@e2e.test`,
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
    const otherLeader = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: `${runId}OTH`,
        firstName: "OTHER",
        lastName: "E2E-CFM",
        email: `other.cfm.${runId}@e2e.test`,
        phone: "3009998877",
        address: "Carrera 9 # 8-7",
        userAccount: {
          create: { roleId: blRole.id, active: true, mustChangePassword: false },
        },
      },
    });
    personIds.push(otherLeader.id);
    tokens.BRANCH_LEADER_OTHER = await jwtService.signAsync({
      sub: otherLeader.id,
    });

    const otherBranch = await prisma.branch.create({
      data: {
        name: `${runId} Other`,
        address: "Calle 4 # 5-6",
        phone: "3001112244",
        active: true,
      },
    });
    testBranchIds.push(otherBranch.id);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.userBranch.create({
      data: {
        userId: otherLeader.id,
        branchId: otherBranch.id,
        assignmentDate: today,
        active: true,
      },
    });

    categoryId = (
      await prisma.category.create({
        data: { name: `${runId} Cfm Category`, active: true },
      })
    ).id;

    unitOfMeasureId = (
      await prisma.unitMeasure.create({
        data: {
          name: `${runId} Cfm Unit`,
          abreviation: UNIT_ABREVIATION,
          active: true,
        },
      })
    ).id;

    productAId = (
      await prisma.product.create({
        data: {
          name: `${runId} Cfm Product A`,
          referenceCode: `CFM-${runId}-A`,
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
          name: `${runId} Cfm Product B`,
          referenceCode: `CFM-${runId}-B`,
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
  // Successful confirm
  // ─────────────────────────────────────────────────────────────────────────────

  describe("successful confirm", () => {
    it("returns 200 with status CONFIRMED and full response shape for BRANCH_LEADER", async () => {
      const { closureId, branchId } = await createClosure({ allCounted: true });

      const response = await confirm(closureId, tokens.BRANCH_LEADER);

      expect(response.status).toBe(200);
      const body = closureOf(response.body);
      expect(body).toMatchObject({
        id: closureId,
        branchId,
        status: "CONFIRMED",
        confirmed: true,
        locked: true,
        countedItems: 2,
        totalItems: 2,
      });
      expect(body.closedAt).not.toBeNull();
      expect(body.closureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("BRANCH_LEADER sees systemQuantity, difference and totalDifferences after confirmation", async () => {
      const { closureId } = await createClosure({ allCounted: true });

      const response = await confirm(closureId, tokens.BRANCH_LEADER);

      expect(response.status).toBe(200);
      const body = closureOf(response.body);
      expect(body).toHaveProperty("totalDifferences");
      expect(body.totalDifferences).toBe(1);

      const itemA = body.items.find((i) => i.productId === productAId);
      expect(itemA).toMatchObject({
        expirationDate: EXP_A,
        physicalQuantity: PHY_QTY_A,
        systemQuantity: SYS_QTY_A,
        difference: PHY_QTY_A - SYS_QTY_A,
      });

      const itemB = body.items.find((i) => i.productId === productBId);
      expect(itemB).toMatchObject({
        expirationDate: EXP_B,
        physicalQuantity: PHY_QTY_B,
        systemQuantity: SYS_QTY_B,
        difference: PHY_QTY_B - SYS_QTY_B,
      });
    });

    it("BRANCH_ASSISTANT does not see systemQuantity, difference or totalDifferences", async () => {
      const { closureId } = await createClosure({ allCounted: true });

      const response = await confirm(closureId, tokens.BRANCH_ASSISTANT);

      expect(response.status).toBe(200);
      const body = closureOf(response.body);
      expect(body).not.toHaveProperty("totalDifferences");
      expect(JSON.stringify(body)).not.toContain("systemQuantity");
      expect(JSON.stringify(body)).not.toContain("difference");
    });

    it("persists CONFIRMED status, locked = true and closedAt in the database", async () => {
      const { closureId } = await createClosure({ allCounted: true });

      await confirm(closureId, tokens.BRANCH_LEADER);

      const inDb = await prisma.inventoryClosure.findUnique({
        where: { id: closureId },
        select: { status: true, confirmed: true, locked: true, closedAt: true },
      });
      expect(inDb?.status).toBe("CONFIRMED");
      expect(inDb?.confirmed).toBe(true);
      expect(inDb?.locked).toBe(true);
      expect(inDb?.closedAt).not.toBeNull();
    });

    it("recalculates and persists correct differences for every detail", async () => {
      const { closureId } = await createClosure({ allCounted: true });

      await confirm(closureId, tokens.BRANCH_LEADER);

      const details = await prisma.inventoryClosureDetail.findMany({
        where: { closureId },
        orderBy: { expirationDate: "asc" },
        select: { productId: true, systemQuantity: true, physicalQuantity: true, difference: true },
      });

      const detailA = details.find((d) => d.productId === productAId);
      const detailB = details.find((d) => d.productId === productBId);

      expect(detailA?.difference).toBe(PHY_QTY_A - SYS_QTY_A);
      expect(detailB?.difference).toBe(PHY_QTY_B - SYS_QTY_B);
    });

    it("creates an audit log with action CONFIRM after a successful confirmation", async () => {
      const { closureId } = await createClosure({ allCounted: true });

      await confirm(closureId, tokens.BRANCH_LEADER);

      const log = await prisma.auditLog.findFirst({
        where: {
          userId: actorIds.BRANCH_LEADER,
          entity: "INVENTORY_CLOSURE",
          entityId: closureId,
          action: "CONFIRM",
        },
      });
      expect(log).not.toBeNull();
      expect(log?.oldData).toMatchObject({ status: "PENDING" });
      expect(log?.newData).toMatchObject({ status: "CONFIRMED" });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Business errors
  // ─────────────────────────────────────────────────────────────────────────────

  describe("business errors", () => {
    it("returns 404 CLOSURE_NOT_FOUND when the closureId does not exist", async () => {
      const response = await confirm(randomUUID(), tokens.BRANCH_LEADER);
      expect(response.status).toBe(404);
      expect(errorOf(response.body).code).toBe("CLOSURE_NOT_FOUND");
    });

    it("returns 422 CLOSURE_LOCKED when the closure is already CONFIRMED", async () => {
      const { closureId } = await createClosure({
        status: "CONFIRMED",
        locked: true,
        allCounted: true,
      });

      const response = await confirm(closureId, tokens.BRANCH_LEADER);
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("CLOSURE_LOCKED");
    });

    it("returns 422 CLOSURE_LOCKED when locked = true even if status is PENDING", async () => {
      const { closureId } = await createClosure({ locked: true, allCounted: true });

      const response = await confirm(closureId, tokens.BRANCH_LEADER);
      expect(response.status).toBe(422);
      expect(errorOf(response.body).code).toBe("CLOSURE_LOCKED");
    });

    it("returns 422 INCOMPLETE_COUNT when not all lots have been counted", async () => {
      const { closureId } = await createClosure({ partialCounted: true });

      const response = await confirm(closureId, tokens.BRANCH_LEADER);
      expect(response.status).toBe(422);

      const error = errorOf(response.body);
      expect(error.code).toBe("INCOMPLETE_COUNT");

      const details = error.details as { pending: { productId: string; expirationDate: string | null }[] };
      expect(details.pending).toHaveLength(1);
      expect(details.pending[0]).toMatchObject({
        productId: productBId,
        expirationDate: EXP_B,
      });
    });

    it("returns 422 INCOMPLETE_COUNT when no lots have been counted at all", async () => {
      const { closureId } = await createClosure();

      const response = await confirm(closureId, tokens.BRANCH_LEADER);
      expect(response.status).toBe(422);

      const error = errorOf(response.body);
      expect(error.code).toBe("INCOMPLETE_COUNT");

      const details = error.details as { pending: unknown[] };
      expect(details.pending).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DTO / param validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe("param validation", () => {
    it("returns 400 when closureId is not a valid UUID", async () => {
      const response = await confirm("not-a-uuid", tokens.BRANCH_LEADER);
      expect(response.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Authorization
  // ─────────────────────────────────────────────────────────────────────────────

  describe("authorization", () => {
    it("returns 401 when no token is provided", async () => {
      const { closureId } = await createClosure({ allCounted: true });
      const response = await confirm(closureId);
      expect(response.status).toBe(401);
    });

    it.each<RoleName>(["SUPERADMIN", "DEV"])(
      "returns 403 for %s role",
      async (roleName) => {
        const { closureId } = await createClosure({ allCounted: true });
        const response = await confirm(closureId, tokens[roleName]);
        expect(response.status).toBe(403);
        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");

        const inDb = await prisma.inventoryClosure.findUnique({
          where: { id: closureId },
          select: { status: true },
        });
        expect(inDb?.status).toBe("PENDING");
      },
    );

    it("returns 403 BRANCH_SCOPE_VIOLATION when the leader belongs to a different branch", async () => {
      const { closureId } = await createClosure({ allCounted: true, unassigned: true });

      const response = await confirm(closureId, tokens.BRANCH_LEADER_OTHER);
      expect(response.status).toBe(403);
      expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");

      const inDb = await prisma.inventoryClosure.findUnique({
        where: { id: closureId },
        select: { status: true },
      });
      expect(inDb?.status).toBe("PENDING");
    });
  });
});
