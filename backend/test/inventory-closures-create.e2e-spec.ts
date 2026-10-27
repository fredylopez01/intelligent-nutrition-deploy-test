import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
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

const NO_ACCESS_ROLE = "E2E_CLOSURE_NO_ACCESS";
type TokenKey = RoleName | typeof NO_ACCESS_ROLE;

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
  closureDate: string;
  status: string;
  confirmed: boolean;
  locked: boolean;
  closedAt: string | null;
  items: ClosureItem[];
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-IC-${runId}`;
const UNIT_ABREVIATION = `IC${runId.slice(-6)}`;
const ALLOWED_ROLES: RoleName[] = ["BRANCH_LEADER", "BRANCH_ASSISTANT"];

const closureOf = (body: unknown) => (body as { data: ClosureBody }).data;
const errorOf = (body: unknown) => (body as ApiError).error;

describe("POST /api/v1/branches/:branchId/inventory-closures (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService;

  let documentTypeId = "";
  let categoryId = "";
  let unitOfMeasureId = "";
  let productAId = "";
  let productBId = "";
  let inactiveProductId = "";
  let mainBranchId = "";
  let emptyBranchId = "";
  let duplicateBranchId = "";
  let inactiveBranchId = "";
  let foreignBranchId = "";
  let noAccessBranchId = "";
  let duplicateClosureId = "";
  let todayUtc = new Date();

  const roleBranches = {} as Record<RoleName, string>;
  const personIds: string[] = [];
  const tokens = {} as Record<TokenKey, string>;
  const actorIds = {} as Record<TokenKey, string>;

  const postClosure = (branchId: string, token?: string) => {
    const pending = request(app!.getHttpServer()).post(
      `/api/v1/branches/${branchId}/inventory-closures`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  const closureCount = (branchId: string) =>
    prisma.inventoryClosure.count({ where: { branchId } });

  const closureOfBranch = (branchId: string) =>
    prisma.inventoryClosure.findUniqueOrThrow({
      where: { branchId_closureDate: { branchId, closureDate: todayUtc } },
      select: { id: true },
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

    todayUtc = businessDate();

    documentTypeId = (
      await prisma.documentType.create({
        data: {
          code: DOCUMENT_CODE,
          name: "Cédula (e2e cierre de inventario)",
        },
      })
    ).id;

    const tokenKeys: TokenKey[] = [
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
      "DEV",
      NO_ACCESS_ROLE,
    ];

    for (const [index, roleName] of tokenKeys.entries()) {
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
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.closure.${runId}@e2e.test`,
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

    const createBranch = (suffix: string, active = true) =>
      prisma.branch.create({
        data: {
          name: `${runId} ${suffix}`,
          address: "Calle 1 # 2-3",
          phone: "3001112233",
          active,
        },
      });

    mainBranchId = (await createBranch("Main Branch")).id;
    emptyBranchId = (await createBranch("Empty Branch")).id;
    duplicateBranchId = (await createBranch("Duplicate Branch")).id;
    inactiveBranchId = (await createBranch("Inactive Branch", false)).id;
    foreignBranchId = (await createBranch("Foreign Branch")).id;
    noAccessBranchId = (await createBranch("No Access Branch")).id;
    roleBranches.BRANCH_LEADER = (await createBranch("Leader Branch")).id;
    roleBranches.BRANCH_ASSISTANT = (await createBranch("Assistant Branch")).id;
    roleBranches.DEV = (await createBranch("Dev Branch")).id;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const roleName of [
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ] as RoleName[]) {
      await prisma.userBranch.create({
        data: {
          userId: actorIds[roleName],
          branchId: roleBranches[roleName],
          assignmentDate: today,
          active: true,
        },
      });
    }

    // The leader also runs the closures of the shared test branches, since
    // only the branch roles start closures.
    await prisma.userBranch.createMany({
      data: [
        mainBranchId,
        emptyBranchId,
        duplicateBranchId,
        inactiveBranchId,
      ].map((branchId) => ({
        userId: actorIds.BRANCH_LEADER,
        branchId,
        assignmentDate: today,
        active: true,
      })),
    });

    categoryId = (
      await prisma.category.create({
        data: { name: `${runId} Closure Category`, active: true },
      })
    ).id;

    const unitOfMeasure = await prisma.unitMeasure.create({
      data: {
        name: `${runId} Closure Unit`,
        abreviation: UNIT_ABREVIATION,
        active: true,
      },
    });
    unitOfMeasureId = unitOfMeasure.id;

    productAId = (
      await prisma.product.create({
        data: {
          name: `${runId} Product A`,
          referenceCode: `IC-${runId}-A`,
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
          referenceCode: `IC-${runId}-B`,
          categoryId,
          unitOfMeasureId,
          price: "9900.00",
          active: true,
        },
      })
    ).id;
    inactiveProductId = (
      await prisma.product.create({
        data: {
          name: `${runId} Inactive Product`,
          referenceCode: `IC-${runId}-I`,
          categoryId,
          unitOfMeasureId,
          price: "7500.00",
          active: false,
        },
      })
    ).id;

    await prisma.branchInventory.createMany({
      data: [
        {
          branchId: mainBranchId,
          productId: productAId,
          quantity: 3,
          minimumStock: 1,
          expirationDate: new Date("2027-01-01T00:00:00.000Z"),
        },
        {
          branchId: mainBranchId,
          productId: productAId,
          quantity: 4,
          minimumStock: 1,
          expirationDate: new Date("2027-02-01T00:00:00.000Z"),
        },
        {
          branchId: mainBranchId,
          productId: productBId,
          quantity: 5,
          minimumStock: 1,
          expirationDate: new Date("2027-03-01T00:00:00.000Z"),
        },
        {
          branchId: mainBranchId,
          productId: inactiveProductId,
          quantity: 9,
          minimumStock: 1,
          expirationDate: new Date("2027-04-01T00:00:00.000Z"),
        },
      ],
    });

    duplicateClosureId = (
      await prisma.inventoryClosure.create({
        data: {
          branchId: duplicateBranchId,
          userId: actorIds.SUPERADMIN,
          closureDate: todayUtc,
          status: "PENDING",
          confirmed: false,
          locked: false,
        },
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    try {
      if (!prisma) return;

      const branchIds = [
        mainBranchId,
        emptyBranchId,
        duplicateBranchId,
        inactiveBranchId,
        foreignBranchId,
        noAccessBranchId,
        ...Object.values(roleBranches),
      ].filter(Boolean);

      const closures = await prisma.inventoryClosure.findMany({
        where: { branchId: { in: branchIds } },
        select: { id: true },
      });
      const closureIds = closures.map(({ id }) => id);

      await prisma.inventoryClosureDetail.deleteMany({
        where: { closureId: { in: closureIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: personIds } }, { entityId: { in: closureIds } }],
        },
      });
      await prisma.inventoryClosure.deleteMany({
        where: { id: { in: closureIds } },
      });
      await prisma.branchInventory.deleteMany({
        where: { branchId: { in: branchIds } },
      });
      await prisma.userBranch.deleteMany({
        where: { userId: { in: personIds } },
      });
      await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
      await prisma.product.deleteMany({
        where: { id: { in: [productAId, productBId, inactiveProductId] } },
      });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.unitMeasure.deleteMany({ where: { id: unitOfMeasureId } });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: personIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: personIds } } });
      await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });

      const noAccessRole = await prisma.role.findUnique({
        where: { name: NO_ACCESS_ROLE },
      });
      if (noAccessRole) {
        const accounts = await prisma.userAccount.count({
          where: { roleId: noAccessRole.id },
        });
        if (accounts === 0) {
          await prisma.role.delete({ where: { id: noAccessRole.id } });
        }
      }
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("successful creation", () => {
    it("creates a pending closure with one line per lot of the active products", async () => {
      const response = await postClosure(
        mainBranchId,
        tokens.BRANCH_LEADER,
      ).expect(201);

      const closure = closureOf(response.body);
      expect(closure).toMatchObject({
        id: expect.any(String),
        branchId: mainBranchId,
        status: "PENDING",
        confirmed: false,
        locked: false,
        closedAt: null,
      });
      expect(closure.closureDate).toBe(todayUtc.toISOString().slice(0, 10));
      expect(closure.items).toHaveLength(3);
      expect(
        closure.items
          .filter(({ productId }) => productId === productAId)
          .map(({ expirationDate }) => expirationDate),
      ).toEqual(["2027-01-01", "2027-02-01"]);

      const itemB = closure.items.find(
        ({ productId }) => productId === productBId,
      );
      expect(itemB).toEqual({
        productId: productBId,
        productName: `${runId} Product B`,
        referenceCode: `IC-${runId}-B`,
        unit: UNIT_ABREVIATION,
        expirationDate: "2027-03-01",
        physicalQuantity: null,
        observation: null,
      });
      expect(
        closure.items.some(({ productId }) => productId === inactiveProductId),
      ).toBe(false);
      expect(await closureCount(mainBranchId)).toBe(1);
    });

    it("snapshots the system quantity of each lot without revealing it", async () => {
      const closure = await closureOfBranch(mainBranchId);
      const details = await prisma.inventoryClosureDetail.findMany({
        where: { closureId: closure.id },
        orderBy: { expirationDate: "asc" },
        select: { productId: true, expirationDate: true, systemQuantity: true },
      });

      expect(details).toEqual([
        {
          productId: productAId,
          expirationDate: new Date("2027-01-01T00:00:00.000Z"),
          systemQuantity: 3,
        },
        {
          productId: productAId,
          expirationDate: new Date("2027-02-01T00:00:00.000Z"),
          systemQuantity: 4,
        },
        {
          productId: productBId,
          expirationDate: new Date("2027-03-01T00:00:00.000Z"),
          systemQuantity: 5,
        },
      ]);
    });

    it("does not write an audit log when the count starts", async () => {
      const closure = await closureOfBranch(mainBranchId);

      expect(
        await prisma.auditLog.count({ where: { entityId: closure.id } }),
      ).toBe(0);
    });

    it("creates a closure without items when the branch has no inventory", async () => {
      const response = await postClosure(
        emptyBranchId,
        tokens.BRANCH_LEADER,
      ).expect(201);

      const closure = closureOf(response.body);
      expect(closure.items).toEqual([]);
      expect(closure.branchId).toBe(emptyBranchId);
      expect(await closureCount(emptyBranchId)).toBe(1);
    });

    it.each<RoleName>(ALLOWED_ROLES)(
      "allows the %s role to create the closure of its branch",
      async (roleName) => {
        const response = await postClosure(
          roleBranches[roleName],
          tokens[roleName],
        ).expect(201);

        expect(closureOf(response.body)).toMatchObject({
          branchId: roleBranches[roleName],
          status: "PENDING",
        });
      },
    );
  });

  describe("duplicate closure", () => {
    it("answers 409 when the branch already has a closure for today", async () => {
      const response = await postClosure(
        duplicateBranchId,
        tokens.BRANCH_LEADER,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "CLOSURE_ALREADY_EXISTS",
        message: "An inventory closure already exists for this branch today.",
        details: { closureId: duplicateClosureId },
      });
      expect(await closureCount(duplicateBranchId)).toBe(1);
    });
  });

  describe("missing or inactive branch", () => {
    it("answers 403 for a branch that does not exist, since it is outside the assignment", async () => {
      const response = await postClosure(
        randomUUID(),
        tokens.BRANCH_LEADER,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
    });

    it("answers 422 when the branch is inactive", async () => {
      const response = await postClosure(
        inactiveBranchId,
        tokens.BRANCH_LEADER,
      ).expect(422);

      expect(errorOf(response.body)).toMatchObject({
        code: "BRANCH_INACTIVE",
        message: "Branch is inactive.",
      });
      expect(await closureCount(inactiveBranchId)).toBe(0);
    });
  });

  describe("access", () => {
    it("rejects a request without an access token", async () => {
      await postClosure(noAccessBranchId).expect(401);

      expect(await closureCount(noAccessBranchId)).toBe(0);
    });

    it.each<TokenKey>(["SUPERADMIN", "DEV", NO_ACCESS_ROLE])(
      "rejects the %s role, since only the branch roles count the stock",
      async (tokenKey) => {
        const response = await postClosure(
          noAccessBranchId,
          tokens[tokenKey],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect(await closureCount(noAccessBranchId)).toBe(0);
      },
    );

    it("rejects a branch leader out of its assigned branch", async () => {
      const response = await postClosure(
        foreignBranchId,
        tokens.BRANCH_LEADER,
      ).expect(403);

      expect(errorOf(response.body)).toMatchObject({
        code: "BRANCH_SCOPE_VIOLATION",
        message: "You do not have access to this branch.",
      });
      expect(await closureCount(foreignBranchId)).toBe(0);
    });
  });
});
