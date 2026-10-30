import {
  afterAll,
  beforeAll,
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

interface MovementRow {
  id: string;
  movementType: string;
  quantity: number;
  movementAt: string;
  observation: string | null;
  product: { id: string; name: string; referenceCode: string };
  branch: { id: string; name: string } | null;
  originBranch: { id: string; name: string } | null;
  user: { id: string; fullName: string };
}

interface MovementDetail extends MovementRow {
  product: MovementRow["product"] & { unit: string };
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-MVL-${runId}`;

const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
  "DEV",
];

const errorOf = (body: unknown) => (body as ApiErrorBody).error;

// Service returns { data: [...], meta: {...} }; ApiResponseInterceptor wraps it
// in { data: { data: [...], meta: {...} } }. This helper handles both shapes.
const listOf = (body: unknown) => {
  const root = body as { data: unknown };
  return (
    root.data &&
    typeof root.data === "object" &&
    "data" in (root.data as object)
      ? root.data
      : root
  ) as { data: MovementRow[]; meta: PaginationMeta };
};

const movementOf = (body: unknown) =>
  (body as { data: MovementDetail }).data;

describe("GET /api/v1/inventory-movements (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;

  let documentTypeId = "";
  let categoryId = "";
  let unitOfMeasureId = "";
  let product1Id = "";
  let product2Id = "";
  let branchAId = "";
  let branchBId = "";

  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;

  // Movement IDs created in beforeAll with fixed timestamps for deterministic filters
  let movEntryAId = "";      // ENTRY     branchA  product1  2026-10-01
  let movExitAId = "";       // EXIT      branchA  product1  2026-10-10
  let movAdjEntryAId = "";   // ADJ_ENTRY branchA  product2  2026-10-15T09
  let movAdjExitAId = "";    // ADJ_EXIT  branchA  product2  2026-10-15T11
  let movTransferAtoBId = ""; // TRANSFER  branchB (dest) + branchA (origin) product1  2026-10-20
  let movEntryBId = "";      // ENTRY     branchB  product1  2026-10-22

  // Ordered by movementAt DESC (newest first) — all 6
  const allIds = () => [
    movEntryBId,
    movTransferAtoBId,
    movAdjExitAId,
    movAdjEntryAId,
    movExitAId,
    movEntryAId,
  ];

  // Movements visible to a BRANCH_LEADER assigned only to branchA
  const branchAIds = () => [
    movTransferAtoBId, // originBranchId = branchA
    movAdjExitAId,
    movAdjEntryAId,
    movExitAId,
    movEntryAId,
  ];

  const getList = (token?: string, query: Record<string, string | number> = {}) => {
    const req = request(app!.getHttpServer())
      .get("/api/v1/inventory-movements")
      .query(query);
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
  };

  const getOne = (movementId: string, token?: string) => {
    const req = request(app!.getHttpServer()).get(
      `/api/v1/inventory-movements/${movementId}`,
    );
    if (token) req.set("Authorization", `Bearer ${token}`);
    return req;
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
        data: { code: DOCUMENT_CODE, name: "Document (e2e movements list)" },
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
          lastName: "E2E-MVL",
          email: `${roleName.toLowerCase()}.mvl.${runId}@e2e.test`,
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

    branchAId = (
      await prisma.branch.create({
        data: {
          name: `${runId} MVL Branch A`,
          address: "Calle 1 # 2-3",
          phone: "3001112233",
          active: true,
        },
      })
    ).id;

    branchBId = (
      await prisma.branch.create({
        data: {
          name: `${runId} MVL Branch B`,
          address: "Calle 4 # 5-6",
          phone: "3001112244",
          active: true,
        },
      })
    ).id;

    // BRANCH_LEADER and BRANCH_ASSISTANT are assigned to branchA only
    for (const roleName of ["BRANCH_LEADER", "BRANCH_ASSISTANT"] as const) {
      await prisma.userBranch.create({
        data: {
          userId: actorIds[roleName],
          branchId: branchAId,
          assignmentDate: new Date(),
          active: true,
        },
      });
    }

    categoryId = (
      await prisma.category.create({
        data: { name: `${runId} MVL Category`, active: true },
      })
    ).id;

    unitOfMeasureId = (
      await prisma.unitMeasure.create({
        data: {
          name: `${runId} MVL Unit`,
          abreviation: `MV${runId.slice(-7)}`,
          active: true,
        },
      })
    ).id;

    product1Id = (
      await prisma.product.create({
        data: {
          name: `${runId} MVL Product 1`,
          referenceCode: `MVL1-${runId}`,
          categoryId,
          unitOfMeasureId,
          price: "10000.00",
          active: true,
        },
      })
    ).id;

    product2Id = (
      await prisma.product.create({
        data: {
          name: `${runId} MVL Product 2`,
          referenceCode: `MVL2-${runId}`,
          categoryId,
          unitOfMeasureId,
          price: "5000.00",
          active: true,
        },
      })
    ).id;

    // Fixed timestamps allow deterministic date-range filter tests
    movEntryAId = (
      await prisma.inventoryMovement.create({
        data: {
          productId: product1Id,
          branchId: branchAId,
          userId: actorIds.SUPERADMIN,
          movementType: "ENTRY",
          quantity: 10,
          movementAt: new Date("2026-10-01T10:00:00.000Z"),
        },
      })
    ).id;

    movExitAId = (
      await prisma.inventoryMovement.create({
        data: {
          productId: product1Id,
          branchId: branchAId,
          userId: actorIds.SUPERADMIN,
          movementType: "EXIT",
          quantity: 3,
          movementAt: new Date("2026-10-10T10:00:00.000Z"),
        },
      })
    ).id;

    movAdjEntryAId = (
      await prisma.inventoryMovement.create({
        data: {
          productId: product2Id,
          branchId: branchAId,
          userId: actorIds.SUPERADMIN,
          movementType: "ADJUSTMENT_ENTRY",
          quantity: 5,
          movementAt: new Date("2026-10-15T09:00:00.000Z"),
        },
      })
    ).id;

    movAdjExitAId = (
      await prisma.inventoryMovement.create({
        data: {
          productId: product2Id,
          branchId: branchAId,
          userId: actorIds.SUPERADMIN,
          movementType: "ADJUSTMENT_EXIT",
          quantity: 2,
          movementAt: new Date("2026-10-15T11:00:00.000Z"),
        },
      })
    ).id;

    movTransferAtoBId = (
      await prisma.inventoryMovement.create({
        data: {
          productId: product1Id,
          branchId: branchBId,
          originBranchId: branchAId,
          userId: actorIds.SUPERADMIN,
          movementType: "TRANSFER",
          quantity: 3,
          movementAt: new Date("2026-10-20T10:00:00.000Z"),
        },
      })
    ).id;

    movEntryBId = (
      await prisma.inventoryMovement.create({
        data: {
          productId: product1Id,
          branchId: branchBId,
          userId: actorIds.SUPERADMIN,
          movementType: "ENTRY",
          quantity: 7,
          movementAt: new Date("2026-10-22T10:00:00.000Z"),
        },
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    try {
      if (!prisma) return;

      const productIds = [product1Id, product2Id].filter(Boolean);
      const branchIds = [branchAId, branchBId].filter(Boolean);
      const movementIds = [
        movEntryAId,
        movExitAId,
        movAdjEntryAId,
        movAdjExitAId,
        movTransferAtoBId,
        movEntryBId,
      ].filter(Boolean);

      await prisma.auditLog.deleteMany({
        where: { userId: { in: personIds } },
      });
      await prisma.inventoryMovement.deleteMany({
        where: { id: { in: movementIds } },
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
  // GET /inventory-movements — listing
  // ─────────────────────────────────────────────────────────────────────────────

  describe("listing", () => {
    it("returns movements ordered by movementAt desc with pagination meta → 200", async () => {
      const response = await getList(tokens.SUPERADMIN).expect(200);
      const body = listOf(response.body);

      expect(body.meta).toMatchObject({ page: 1, limit: 20 });
      expect(body.meta.total).toBeGreaterThanOrEqual(6);
      const ids = body.data.map((m) => m.id);
      // newest first
      expect(ids.indexOf(movEntryBId)).toBeLessThan(ids.indexOf(movEntryAId));
    });

    it("returns the correct shape for each movement row", async () => {
      const response = await getList(tokens.SUPERADMIN, {
        movementType: "ENTRY",
        branchId: branchAId,
      }).expect(200);

      const row = listOf(response.body).data[0];
      expect(row).toMatchObject({
        id: expect.any(String),
        movementType: "ENTRY",
        quantity: expect.any(Number),
        movementAt: expect.any(String),
        product: {
          id: product1Id,
          name: expect.any(String),
          referenceCode: `MVL1-${runId}`,
        },
        branch: { id: branchAId, name: expect.any(String) },
        user: { id: actorIds.SUPERADMIN, fullName: expect.any(String) },
      });
    });

    it("includes originBranch for TRANSFER movements", async () => {
      const response = await getList(tokens.SUPERADMIN, {
        movementType: "TRANSFER",
      }).expect(200);

      const row = listOf(response.body).data[0];
      expect(row.originBranch).toEqual({
        id: branchAId,
        name: expect.any(String),
      });
    });

    it("paginates correctly across pages", async () => {
      const page1 = listOf(
        (await getList(tokens.SUPERADMIN, { page: 1, limit: 2 }).expect(200)).body,
      );
      const page2 = listOf(
        (await getList(tokens.SUPERADMIN, { page: 2, limit: 2 }).expect(200)).body,
      );

      expect(page1.meta).toMatchObject({ page: 1, limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page2.meta.page).toBe(2);
      const page1Ids = page1.data.map((m) => m.id);
      const page2Ids = page2.data.map((m) => m.id);
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    });

    it("returns an empty page with total=0 for a non-existent branchId", async () => {
      const body = listOf(
        (await getList(tokens.SUPERADMIN, { branchId: randomUUID() }).expect(200)).body,
      );

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /inventory-movements — filters
  // ─────────────────────────────────────────────────────────────────────────────

  describe("filters", () => {
    it("filters by branchId: includes movements where branchId OR originBranchId matches", async () => {
      const body = listOf(
        (await getList(tokens.SUPERADMIN, { branchId: branchAId }).expect(200)).body,
      );

      const ids = body.data.map((m) => m.id);
      expect(ids).toContain(movTransferAtoBId); // originBranchId = branchA
      expect(ids).not.toContain(movEntryBId);   // branchId = branchB, no origin
    });

    it("filters by the user who registered the movement", async () => {
      const mine = listOf(
        (
          await getList(tokens.SUPERADMIN, {
            branchId: branchAId,
            userId: actorIds.SUPERADMIN,
          }).expect(200)
        ).body,
      );
      expect(mine.data.map((m) => m.id).sort()).toEqual(
        [...branchAIds()].sort(),
      );

      const others = listOf(
        (
          await getList(tokens.SUPERADMIN, {
            branchId: branchAId,
            userId: actorIds.DEV,
          }).expect(200)
        ).body,
      );
      expect(others.meta.total).toBe(0);
    });

    it("rejects a non-UUID userId → 400", async () => {
      await getList(tokens.SUPERADMIN, { userId: "laura" }).expect(400);
    });

    it("filters by productId", async () => {
      const body = listOf(
        (await getList(tokens.SUPERADMIN, { productId: product2Id }).expect(200)).body,
      );

      expect(body.meta.total).toBe(2);
      const ids = body.data.map((m) => m.id);
      expect(ids).toContain(movAdjEntryAId);
      expect(ids).toContain(movAdjExitAId);
    });

    it("filters by movementType=TRANSFER", async () => {
      const body = listOf(
        (await getList(tokens.SUPERADMIN, { movementType: "TRANSFER" }).expect(200)).body,
      );

      expect(body.meta.total).toBe(1);
      expect(body.data[0].id).toBe(movTransferAtoBId);
    });

    it("filters by movementType=ADJUSTMENT_EXIT", async () => {
      const body = listOf(
        (
          await getList(tokens.SUPERADMIN, { movementType: "ADJUSTMENT_EXIT" }).expect(
            200,
          )
        ).body,
      );

      expect(body.meta.total).toBe(1);
      expect(body.data[0].id).toBe(movAdjExitAId);
    });

    it("filters by from date (inclusive from the start of the Bogota day)", async () => {
      const body = listOf(
        (await getList(tokens.SUPERADMIN, { from: "2026-10-20" }).expect(200)).body,
      );

      const ids = body.data.map((m) => m.id);
      expect(ids).toContain(movTransferAtoBId);
      expect(ids).toContain(movEntryBId);
      expect(ids).not.toContain(movEntryAId);
      expect(ids).not.toContain(movExitAId);
    });

    it("filters by to date (inclusive until the end of the Bogota day)", async () => {
      const body = listOf(
        (await getList(tokens.SUPERADMIN, { to: "2026-10-10" }).expect(200)).body,
      );

      const ids = body.data.map((m) => m.id);
      expect(ids).toContain(movEntryAId);
      expect(ids).toContain(movExitAId);
      expect(ids).not.toContain(movAdjEntryAId);
    });

    it("combines from and to date filters", async () => {
      const body = listOf(
        (
          await getList(tokens.SUPERADMIN, {
            from: "2026-10-10",
            to: "2026-10-15",
          }).expect(200)
        ).body,
      );

      const ids = body.data.map((m) => m.id);
      expect(ids).toContain(movExitAId);
      expect(ids).toContain(movAdjEntryAId);
      expect(ids).toContain(movAdjExitAId);
      expect(ids).not.toContain(movEntryAId);
      expect(ids).not.toContain(movTransferAtoBId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Query validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe("query validation", () => {
    it("rejects page=0 → 400", async () => {
      const response = await getList(tokens.SUPERADMIN, { page: 0 }).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects limit > 100 → 400", async () => {
      const response = await getList(tokens.SUPERADMIN, { limit: 101 }).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a non-UUID branchId → 400", async () => {
      const response = await getList(tokens.SUPERADMIN, {
        branchId: "not-a-uuid",
      }).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a non-UUID productId → 400", async () => {
      const response = await getList(tokens.SUPERADMIN, {
        productId: "not-a-uuid",
      }).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects an invalid movementType → 400", async () => {
      const response = await getList(tokens.SUPERADMIN, {
        movementType: "INVALID",
      }).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a from date in wrong format → 400", async () => {
      const response = await getList(tokens.SUPERADMIN, {
        from: "01/10/2026",
      }).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });

    it("rejects a to date in wrong format → 400", async () => {
      const response = await getList(tokens.SUPERADMIN, {
        to: "31-10-2026",
      }).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GET /inventory-movements/:id — findOne
  // ─────────────────────────────────────────────────────────────────────────────

  describe("findOne", () => {
    it("returns the movement with full detail shape including unit → 200", async () => {
      const response = await getOne(movEntryAId, tokens.SUPERADMIN).expect(200);
      const movement = movementOf(response.body);

      expect(movement).toMatchObject({
        id: movEntryAId,
        movementType: "ENTRY",
        quantity: 10,
        movementAt: expect.any(String),
        product: {
          id: product1Id,
          name: `${runId} MVL Product 1`,
          referenceCode: `MVL1-${runId}`,
          unit: expect.any(String),
        },
        branch: { id: branchAId, name: expect.any(String) },
        originBranch: null,
        user: { id: actorIds.SUPERADMIN, fullName: expect.any(String) },
      });
    });

    it("returns originBranch for TRANSFER movements", async () => {
      const response = await getOne(movTransferAtoBId, tokens.SUPERADMIN).expect(200);
      const movement = movementOf(response.body);

      expect(movement.branch!.id).toBe(branchBId);
      expect(movement.originBranch!.id).toBe(branchAId);
    });

    it("returns 404 MOVEMENT_NOT_FOUND when the movement does not exist", async () => {
      const response = await getOne(randomUUID(), tokens.SUPERADMIN).expect(404);
      expect(errorOf(response.body).code).toBe("MOVEMENT_NOT_FOUND");
    });

    it("returns 400 for a non-UUID movementId", async () => {
      const response = await getOne("not-a-uuid", tokens.SUPERADMIN).expect(400);
      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Role access and scope
  // ─────────────────────────────────────────────────────────────────────────────

  describe("role access and scope", () => {
    describe("findAll scope", () => {
      it("SUPERADMIN sees all movements → 200", async () => {
        const body = listOf((await getList(tokens.SUPERADMIN).expect(200)).body);
        expect(body.meta.total).toBeGreaterThanOrEqual(6);

        const otherBranchBody = listOf(
          (await getList(tokens.SUPERADMIN, { branchId: branchBId }).expect(200))
            .body,
        );
        expect(otherBranchBody.data.map((movement) => movement.id)).toEqual(
          expect.arrayContaining([movEntryBId, movTransferAtoBId]),
        );
      });

      it("denies DEV, which is not part of the movements roles → 403", async () => {
        const response = await getList(tokens.DEV).expect(403);
        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      });

      it("BRANCH_LEADER sees only movements related to their branch (branchId OR originBranchId)", async () => {
        const body = listOf(
          (await getList(tokens.BRANCH_LEADER, { branchId: branchAId }).expect(200))
            .body,
        );

        const ids = body.data.map((m) => m.id);
        // Should see branchA movements and the TRANSFER that originates from branchA
        for (const id of branchAIds()) {
          expect(ids).toContain(id);
        }
        // Should NOT see branchB-only movement
        expect(ids).not.toContain(movEntryBId);
      });

      it("BRANCH_ASSISTANT sees only movements related to their branch", async () => {
        const body = listOf(
          (
            await getList(tokens.BRANCH_ASSISTANT, { branchId: branchAId }).expect(
              200,
            )
          ).body,
        );

        const ids = body.data.map((m) => m.id);
        for (const id of branchAIds()) {
          expect(ids).toContain(id);
        }
        expect(ids).not.toContain(movEntryBId);
      });

      it.each(["BRANCH_LEADER", "BRANCH_ASSISTANT"] as const)(
        "%s must send the branchId → 400 BRANCH_REQUIRED",
        async (roleName) => {
          const response = await getList(tokens[roleName]).expect(400);
          expect(errorOf(response.body).code).toBe("BRANCH_REQUIRED");
        },
      );

      it("BRANCH_LEADER filtering by a branch outside their scope → 403 BRANCH_SCOPE_VIOLATION", async () => {
        const response = await getList(tokens.BRANCH_LEADER, {
          branchId: branchBId,
        }).expect(403);
        expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
      });

      it("returns 401 when no token is provided", async () => {
        await getList().expect(401);
      });
    });

    describe("findOne scope", () => {
      it("BRANCH_LEADER can read a movement from their branch → 200", async () => {
        await getOne(movEntryAId, tokens.BRANCH_LEADER).expect(200);
      });

      it("BRANCH_LEADER can read a TRANSFER where their branch is the origin → 200", async () => {
        await getOne(movTransferAtoBId, tokens.BRANCH_LEADER).expect(200);
      });

      it("BRANCH_LEADER cannot read a movement from a branch outside their scope → 403 BRANCH_SCOPE_VIOLATION", async () => {
        const response = await getOne(movEntryBId, tokens.BRANCH_LEADER).expect(403);
        expect(errorOf(response.body).code).toBe("BRANCH_SCOPE_VIOLATION");
      });

      it("BRANCH_ASSISTANT can read a movement from their branch → 200", async () => {
        await getOne(movAdjEntryAId, tokens.BRANCH_ASSISTANT).expect(200);
      });

      it("returns 401 when no token is provided", async () => {
        await getOne(movEntryAId).expect(401);
      });
    });
  });
});
