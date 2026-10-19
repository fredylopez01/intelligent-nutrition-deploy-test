import type { Server } from "node:http";
import {
  jest,
  describe,
  beforeEach,
  beforeAll,
  afterAll,
  it,
  expect,
} from "@jest/globals";
import type { INestApplication } from "@nestjs/common";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;

interface ApiError {
  error: { code: string; message: string; details: unknown };
}

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

const { Test } = await import("@nestjs/testing");
const { Module } = await import("@nestjs/common");
const { ConfigModule } = await import("@nestjs/config");
const { PassportModule } = await import("@nestjs/passport");
const { JwtModule, JwtService } = await import("@nestjs/jwt");
const { Reflector, APP_GUARD } = await import("@nestjs/core");
const { CategoriesController } = await import("./categories.controller.js");
const { CategoriesService } = await import("./categories.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { JwtStrategy } = await import("../auth/strategies/jwt.strategy.js");
const { JwtAuthGuard } = await import("../../common/guards/jwt-auth.guard.js");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const { configureApp } = await import("../../app.setup.js");
const request = (await import("supertest")).default;

const mockPrisma = {
  category: {
    findUnique: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    count: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  userAccount: { findUnique: jest.fn<AsyncMock>() },
  $transaction:
    jest.fn<
      (
        operation: TransactionOperation | Array<Promise<unknown>>,
      ) => Promise<unknown>
    >(),
};

const mockAudit = {
  createAuditLog: jest.fn<AsyncMock>(),
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.register({
      secret: "test-secret",
      signOptions: { expiresIn: "1h" },
    }),
  ],
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    Reflector,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: PrismaService, useValue: mockPrisma },
    { provide: AuditService, useValue: mockAudit },
  ],
})
class TestCategoriesModule {}

const adminId = "admin-uuid-1";
const categoryId = "33333333-3333-4333-8333-333333333333";
const createdAt = "2026-10-07T15:30:00.000Z";

function buildUser(roleName: string) {
  return {
    personId: adminId,
    roleId: "role-uuid-1",
    active: true,
    mustChangePassword: false,
    person: {
      id: adminId,
      firstName: "Admin",
      lastName: "Test",
      email: "admin@e2e.test",
      active: true,
    },
    role: { id: "role-uuid-1", name: roleName, active: true },
    branchAssignments: [],
  };
}

function buildCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: categoryId,
    name: "Proteínas",
    description: "Suplementos de proteína",
    active: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe("CategoriesController (HTTP)", () => {
  let app: INestApplication;
  let token: string;

  const http = () => request(app.getHttpServer() as Server);
  const asRole = (roleName: string) =>
    mockPrisma.userAccount.findUnique.mockResolvedValue(buildUser(roleName));

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [TestCategoriesModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    token = moduleFixture.get(JwtService).sign({ sub: adminId });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(mockPrisma),
    );
    asRole("SUPERADMIN");
    mockPrisma.category.findUnique.mockResolvedValue(null);
    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.category.count.mockResolvedValue(0);
    mockPrisma.category.create.mockResolvedValue(buildCategory());
    mockPrisma.category.update.mockResolvedValue(buildCategory());
    mockAudit.createAuditLog.mockResolvedValue({});
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe("POST /api/v1/categories", () => {
    const validPayload = {
      name: "Proteínas",
      description: "Suplementos de proteína",
    };

    it("creates a category and audits the creation", async () => {
      const response = await http()
        .post("/api/v1/categories")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload)
        .expect(201);

      expect(response.body).toEqual({ data: buildCategory() });
      expect(mockPrisma.category.create).toHaveBeenCalledWith({
        data: validPayload,
      });
      expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminId,
          action: "CREATE",
          entity: "CATEGORY",
          entityId: categoryId,
        }),
        mockPrisma,
      );
    });

    it("allows the branch leader to create a category", async () => {
      asRole("BRANCH_LEADER");

      await http()
        .post("/api/v1/categories")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload)
        .expect(201);
    });

    it("returns 409 when the name already exists", async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory());

      const response = await http()
        .post("/api/v1/categories")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload)
        .expect(409);

      expect((response.body as ApiError).error.code).toBe(
        "CATEGORY_NAME_ALREADY_EXISTS",
      );
      expect(mockPrisma.category.create).not.toHaveBeenCalled();
    });

    const invalidPayloads: Array<[string, Record<string, unknown>, string]> = [
      ["the name is missing", { description: "Sin nombre" }, "name"],
      [
        "the name is shorter than 2 characters",
        { ...validPayload, name: "a" },
        "name",
      ],
      [
        "the name exceeds 100 characters",
        { ...validPayload, name: "A".repeat(101) },
        "name",
      ],
      [
        "the description is empty",
        { ...validPayload, description: "" },
        "description",
      ],
      [
        "the description exceeds 255 characters",
        { ...validPayload, description: "D".repeat(256) },
        "description",
      ],
      [
        "an unknown field is sent",
        { ...validPayload, active: false },
        "active",
      ],
    ];

    it.each(invalidPayloads)(
      "returns 400 when %s",
      async (_label, payload, field) => {
        const response = await http()
          .post("/api/v1/categories")
          .set("Authorization", `Bearer ${token}`)
          .send(payload)
          .expect(400);

        expect((response.body as ApiError).error.details).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
        expect(mockPrisma.category.create).not.toHaveBeenCalled();
      },
    );

    // Known defect (Contract API Sprint 4, §3.2 and HS-067): the description is
    // optional, but the DTO validates it as a required non-empty string.
    it.failing("accepts a category without description", async () => {
      await http()
        .post("/api/v1/categories")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Proteínas" })
        .expect(201);
    });

    it("requires authentication", async () => {
      await http().post("/api/v1/categories").send(validPayload).expect(401);
    });

    it("returns 403 for the branch assistant", async () => {
      asRole("BRANCH_ASSISTANT");

      const response = await http()
        .post("/api/v1/categories")
        .set("Authorization", `Bearer ${token}`)
        .send(validPayload)
        .expect(403);

      expect((response.body as ApiError).error.code).toBe(
        "INSUFFICIENT_PERMISSIONS",
      );
      expect(mockPrisma.category.create).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/categories", () => {
    it("returns the paginated list for the branch assistant", async () => {
      asRole("BRANCH_ASSISTANT");
      mockPrisma.category.count.mockResolvedValue(1);
      mockPrisma.category.findMany.mockResolvedValue([buildCategory()]);

      const response = await http()
        .get("/api/v1/categories")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        data: [buildCategory()],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it("applies the query filters, ordering and pagination", async () => {
      await http()
        .get("/api/v1/categories")
        .query({
          page: 2,
          limit: 5,
          active: "true",
          search: "pro",
          sortBy: "createdAt",
          sortOrder: "DESC",
        })
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const where = {
        active: true,
        name: { contains: "pro", mode: "insensitive" },
      };
      expect(mockPrisma.category.count).toHaveBeenCalledWith({ where });
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          skip: 5,
          take: 5,
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it.each([
      ["limit above 100", { limit: 101 }],
      ["page below 1", { page: 0 }],
      ["a non-boolean active", { active: "maybe" }],
      ["an unsupported sortBy", { sortBy: "description" }],
      ["a search longer than 150 characters", { search: "s".repeat(151) }],
    ])("returns 400 for %s", async (_label, query) => {
      await http()
        .get("/api/v1/categories")
        .query(query)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("returns SEARCH_TOO_SHORT for a one-character search", async () => {
      const response = await http()
        .get("/api/v1/categories")
        .query({ search: "a" })
        .set("Authorization", `Bearer ${token}`)
        .expect(400);

      expect((response.body as ApiError).error.code).toBe("SEARCH_TOO_SHORT");
    });

    it("requires authentication", async () => {
      await http().get("/api/v1/categories").expect(401);
    });
  });

  describe("GET /api/v1/categories/:categoryId", () => {
    it("returns the category", async () => {
      mockPrisma.category.findUnique.mockResolvedValue(buildCategory());

      const response = await http()
        .get(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({ data: buildCategory() });
    });

    it("returns 404 when the category does not exist", async () => {
      const response = await http()
        .get(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);

      expect((response.body as ApiError).error.code).toBe("NOT_FOUND");
    });

    it("returns 400 for an id that is not a UUID", async () => {
      await http()
        .get("/api/v1/categories/not-a-uuid")
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });

  describe("PATCH /api/v1/categories/:categoryId", () => {
    beforeEach(() => {
      mockPrisma.category.findUnique.mockImplementation((args) => {
        const { where } = args as { where: { id?: string } };
        return Promise.resolve(
          where.id === categoryId
            ? buildCategory({ description: "Descripción anterior" })
            : null,
        );
      });
    });

    it("updates the category", async () => {
      const updated = buildCategory({ name: "Proteínas Premium" });
      mockPrisma.category.update.mockResolvedValue(updated);

      const response = await http()
        .patch(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Proteínas Premium", description: "Descripción nueva" })
        .expect(200);

      expect(response.body).toEqual({ data: updated });
      expect(mockPrisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: categoryId },
          data: { name: "Proteínas Premium", description: "Descripción nueva" },
        }),
      );
    });

    it("returns 400 when no field is sent", async () => {
      await http()
        .patch(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });

    it("returns 400 when an unknown field is sent", async () => {
      const response = await http()
        .patch(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Proteínas Premium", active: false })
        .expect(400);

      expect((response.body as ApiError).error.details).toEqual(
        expect.arrayContaining([expect.stringContaining("active")]),
      );
    });

    it("returns 409 when the name belongs to another category", async () => {
      mockPrisma.category.findUnique.mockImplementation((args) => {
        const { where } = args as { where: { id?: string } };
        return Promise.resolve(
          where.id === categoryId
            ? buildCategory()
            : buildCategory({ id: "other-id", name: "Vitaminas" }),
        );
      });

      await http()
        .patch(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Vitaminas" })
        .expect(409);

      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });

    it("returns 404 when the category does not exist", async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await http()
        .patch(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Nueva" })
        .expect(404);
    });

    it("returns 400 for an id that is not a UUID", async () => {
      await http()
        .patch("/api/v1/categories/not-a-uuid")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Nueva" })
        .expect(400);
    });

    it("returns 403 for the branch assistant", async () => {
      asRole("BRANCH_ASSISTANT");

      await http()
        .patch(`/api/v1/categories/${categoryId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Nueva" })
        .expect(403);

      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/v1/categories/:categoryId/status", () => {
    beforeEach(() => {
      mockPrisma.category.findUnique.mockResolvedValue(
        buildCategory({ active: true }),
      );
    });

    it("deactivates the category", async () => {
      const response = await http()
        .patch(`/api/v1/categories/${categoryId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: false })
        .expect(200);

      expect(response.body).toEqual({
        data: { message: "Category status updated successfully." },
      });
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: categoryId, active: true },
        data: { active: false },
      });
    });

    it("returns 409 ALREADY_IN_STATE when the status does not change", async () => {
      const response = await http()
        .patch(`/api/v1/categories/${categoryId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: true })
        .expect(409);

      expect((response.body as ApiError).error.code).toBe("ALREADY_IN_STATE");
      expect(mockPrisma.category.update).not.toHaveBeenCalled();
    });

    it("returns 404 when the category does not exist", async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await http()
        .patch(`/api/v1/categories/${categoryId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: false })
        .expect(404);
    });

    it("returns 400 when active is not a boolean", async () => {
      await http()
        .patch(`/api/v1/categories/${categoryId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: "no" })
        .expect(400);
    });

    it("returns 403 for the branch assistant", async () => {
      asRole("BRANCH_ASSISTANT");

      await http()
        .patch(`/api/v1/categories/${categoryId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: false })
        .expect(403);
    });

    // Known defect (Contract API Sprint 4, §3 and §17, HS-069): only the
    // SUPERADMIN may activate or deactivate categories, but the endpoint also
    // allows the BRANCH_LEADER role.
    it.failing("returns 403 for the branch leader", async () => {
      asRole("BRANCH_LEADER");

      await http()
        .patch(`/api/v1/categories/${categoryId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: false })
        .expect(403);
    });
  });
});
