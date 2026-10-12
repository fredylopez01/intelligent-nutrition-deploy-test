import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;

interface CategoryRecord {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface NameLookup {
  where: { id?: string; name?: string };
}

const prismaMock = {
  category: {
    findUnique: jest.fn<AsyncMock>(),
    findFirst: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    count: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  $transaction:
    jest.fn<
      (
        operation: TransactionOperation | Array<Promise<unknown>>,
      ) => Promise<unknown>
    >(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { CategoriesService } = await import("./categories.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const categoryId = "33333333-3333-4333-8333-333333333333";
const otherCategoryId = "44444444-4444-4444-8444-444444444444";
const createdAt = new Date("2026-10-07T15:30:00.000Z");

const currentUser: AuthenticatedUser = {
  id: "admin-user-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

function buildCategory(
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
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

describe("CategoriesService", () => {
  let service: InstanceType<typeof CategoriesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
    );
    prismaMock.category.findUnique.mockResolvedValue(null);
    prismaMock.category.findFirst.mockResolvedValue(null);
    prismaMock.category.findMany.mockResolvedValue([]);
    prismaMock.category.count.mockResolvedValue(0);
    prismaMock.category.create.mockResolvedValue(buildCategory());
    prismaMock.category.update.mockResolvedValue(buildCategory());
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  describe("create", () => {
    it("creates the category and records the audit log", async () => {
      const category = buildCategory();
      prismaMock.category.create.mockResolvedValue(category);

      const result: unknown = await service.create(
        { name: "Proteínas", description: "Suplementos de proteína" },
        currentUser,
        "127.0.0.1",
      );

      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { name: "Proteínas" },
      });
      expect(prismaMock.category.create).toHaveBeenCalledWith({
        data: { name: "Proteínas", description: "Suplementos de proteína" },
      });
      expect(result).toBe(category);
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        {
          userId: "admin-user-id",
          action: "CREATE",
          entity: "CATEGORY",
          entityId: categoryId,
          newData: category,
          reason: "Creación de la categoria Proteínas",
          ipAddress: "127.0.0.1",
        },
        prismaMock,
      );
    });

    it("creates a category without description", async () => {
      const category = buildCategory({ description: null });
      prismaMock.category.create.mockResolvedValue(category);

      const result: unknown = await service.create(
        { name: "Proteínas" },
        currentUser,
      );

      expect(prismaMock.category.create).toHaveBeenCalledWith({
        data: { name: "Proteínas", description: undefined },
      });
      expect(result).toBe(category);
      expect(auditMock.createAuditLog).toHaveBeenCalledTimes(1);
    });

    it("leaves the active flag to the database default", async () => {
      await service.create(
        { name: "Proteínas", description: "Suplementos de proteína" },
        currentUser,
      );

      const [{ data }] = prismaMock.category.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(data).not.toHaveProperty("active");
    });

    it("creates and audits the category with the transaction client", async () => {
      const category = buildCategory();
      const transactionClient = {
        category: { create: jest.fn<AsyncMock>().mockResolvedValue(category) },
      };
      prismaMock.$transaction.mockImplementation((operation) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : operation(transactionClient),
      );

      await service.create(
        { name: "Proteínas", description: "Suplementos de proteína" },
        currentUser,
      );

      expect(transactionClient.category.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.category.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: categoryId }),
        transactionClient,
      );
    });

    it("rejects a name that already exists", async () => {
      prismaMock.category.findUnique.mockResolvedValue(buildCategory());

      await expect(
        service.create(
          { name: "Proteínas", description: "Otra descripción" },
          currentUser,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: "CATEGORY_NAME_ALREADY_EXISTS",
          message: "Category with this name already exists",
        },
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.category.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("does not audit when the insert fails", async () => {
      prismaMock.category.create.mockRejectedValue(
        new Error("connection lost"),
      );

      await expect(
        service.create(
          { name: "Proteínas", description: "Suplementos de proteína" },
          currentUser,
        ),
      ).rejects.toThrow("connection lost");
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("fails the creation when the audit log cannot be written", async () => {
      auditMock.createAuditLog.mockRejectedValue(new Error("audit down"));

      await expect(
        service.create(
          { name: "Proteínas", description: "Suplementos de proteína" },
          currentUser,
        ),
      ).rejects.toThrow("audit down");
    });

    // Known defect (Contract API Sprint 4, §3.2 and HS-067): the name must be
    // unique ignoring case, but the lookup is an exact match. The fakes below
    // behave like the database: exact match for findUnique and a
    // case-insensitive match for a lookup done with findFirst or findMany.
    it.failing("rejects a name that differs only by case", async () => {
      const existing = buildCategory({ name: "Proteínas" });
      prismaMock.category.findUnique.mockImplementation((args) => {
        const { where } = args as NameLookup;
        return Promise.resolve(where.name === existing.name ? existing : null);
      });
      const caseInsensitiveLookup = (args: unknown) => {
        const { where } = args as { where: { name: { equals: string } } };
        const matches =
          where.name.equals.toLowerCase() === existing.name.toLowerCase();
        return matches ? existing : null;
      };
      prismaMock.category.findFirst.mockImplementation((args) =>
        Promise.resolve(caseInsensitiveLookup(args)),
      );
      prismaMock.category.findMany.mockImplementation((args) => {
        const found = caseInsensitiveLookup(args);
        return Promise.resolve(found ? [found] : []);
      });

      await expect(
        service.create(
          { name: "PROTEÍNAS", description: "Duplicada" },
          currentUser,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "CATEGORY_NAME_ALREADY_EXISTS" },
      });
      expect(prismaMock.category.create).not.toHaveBeenCalled();
    });

    // Known defect (Contract API Sprint 4, §3.2): two simultaneous requests
    // with the same name both pass the lookup, and the second insert fails on
    // the unique index. `update` maps that error to a conflict; `create`
    // lets the raw database error escape as a 500.
    it.failing(
      "maps a unique constraint violation to a name conflict",
      async () => {
        prismaMock.category.create.mockRejectedValue({ code: "P2002" });

        await expect(
          service.create(
            { name: "Proteínas", description: "Suplementos de proteína" },
            currentUser,
          ),
        ).rejects.toMatchObject({
          status: 409,
          response: { code: "CATEGORY_NAME_ALREADY_EXISTS" },
        });
        expect(auditMock.createAuditLog).not.toHaveBeenCalled();
      },
    );
  });

  describe("findAll", () => {
    it("applies the filters, ordering and pagination", async () => {
      prismaMock.category.count.mockResolvedValue(25);
      prismaMock.category.findMany.mockResolvedValue([buildCategory()]);

      const result = await service.findAll({
        page: 2,
        limit: 10,
        active: true,
        search: "prote",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      const where = {
        active: true,
        name: { contains: "prote", mode: "insensitive" },
      };
      expect(prismaMock.category.count).toHaveBeenCalledWith({ where });
      expect(prismaMock.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          skip: 10,
          take: 10,
          orderBy: { createdAt: "desc" },
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it("returns zero pages and no filter when there are no categories", async () => {
      const result = await service.findAll({
        page: 1,
        limit: 10,
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(prismaMock.category.count).toHaveBeenCalledWith({ where: {} });
      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it("rejects a search shorter than 2 characters", async () => {
      await expect(
        service.findAll({
          page: 1,
          limit: 10,
          search: "a",
          sortBy: "name",
          sortOrder: "asc",
        }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: "SEARCH_TOO_SHORT" },
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("findOne", () => {
    it("returns the category", async () => {
      const category = buildCategory();
      prismaMock.category.findUnique.mockResolvedValue(category);

      await expect(service.findOne(categoryId)).resolves.toBe(category);
      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { id: categoryId },
      });
    });

    it("returns not found for a missing category", async () => {
      await expect(service.findOne(categoryId)).rejects.toMatchObject({
        status: 404,
        message: "Category not found",
      });
    });
  });

  describe("update", () => {
    const existing = buildCategory({
      name: "Proteínas",
      description: "Descripción anterior",
    });

    const lookupOtherCategoryByName = (args: unknown) => {
      const { where } = args as NameLookup;
      return Promise.resolve(
        where.id === categoryId
          ? existing
          : buildCategory({ id: otherCategoryId, name: "Vitaminas" }),
      );
    };

    beforeEach(() => {
      prismaMock.category.findUnique.mockImplementation((args) => {
        const { where } = args as NameLookup;
        return Promise.resolve(where.id === categoryId ? existing : null);
      });
    });

    it("updates the category and audits the change when name and description change", async () => {
      const updated = buildCategory({
        name: "Proteínas Premium",
        description: "Descripción nueva",
      });
      prismaMock.category.update.mockResolvedValue(updated);

      const result: unknown = await service.update(
        categoryId,
        { name: "Proteínas Premium", description: "Descripción nueva" },
        currentUser,
        "127.0.0.1",
      );

      expect(prismaMock.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: categoryId },
          data: { name: "Proteínas Premium", description: "Descripción nueva" },
        }),
      );
      expect(result).toBe(updated);
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        {
          userId: "admin-user-id",
          action: "UPDATE",
          entity: "CATEGORY",
          entityId: categoryId,
          oldData: existing,
          newData: updated,
          reason: "Actualización de la categoria Proteínas Premium",
          ipAddress: "127.0.0.1",
        },
        prismaMock,
      );
    });

    it("audits a change that only affects the name", async () => {
      prismaMock.category.update.mockResolvedValue(
        buildCategory({ name: "Proteínas Premium" }),
      );

      await service.update(
        categoryId,
        { name: "Proteínas Premium" },
        currentUser,
      );

      expect(auditMock.createAuditLog).toHaveBeenCalledTimes(1);
    });

    // Known defect (Contract API Sprint 4, §2.9 and HS-069): every change must
    // be audited, but the audit only runs when the name changed AND the
    // description sent differs from the stored one. A description-only change,
    // or a name change that resends the same description (what the edit form
    // sends), is not audited.
    it.failing(
      "audits a name change that resends the unchanged description",
      async () => {
        prismaMock.category.update.mockResolvedValue(
          buildCategory({
            name: "Proteínas Premium",
            description: "Descripción anterior",
          }),
        );

        await service.update(
          categoryId,
          { name: "Proteínas Premium", description: "Descripción anterior" },
          currentUser,
        );

        expect(auditMock.createAuditLog).toHaveBeenCalledTimes(1);
      },
    );

    it.failing(
      "audits a change that only affects the description",
      async () => {
        prismaMock.category.update.mockResolvedValue(
          buildCategory({ description: "Solo descripción" }),
        );

        await service.update(
          categoryId,
          { description: "Solo descripción" },
          currentUser,
        );

        expect(auditMock.createAuditLog).toHaveBeenCalledTimes(1);
      },
    );

    it("does not look up the name when it is unchanged", async () => {
      await service.update(
        categoryId,
        { name: "Proteínas", description: "Otra" },
        currentUser,
      );

      expect(prismaMock.category.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { id: categoryId },
      });
    });

    it("rejects an update without fields", async () => {
      await expect(
        service.update(categoryId, {}, currentUser),
      ).rejects.toMatchObject({
        status: 400,
        message: "At least one field must be provided",
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("returns not found for a missing category", async () => {
      prismaMock.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update(categoryId, { name: "Nueva" }, currentUser),
      ).rejects.toMatchObject({ status: 404, message: "Category not found" });
      expect(prismaMock.category.update).not.toHaveBeenCalled();
    });

    it("rejects a name used by another category", async () => {
      prismaMock.category.findUnique.mockImplementation(
        lookupOtherCategoryByName,
      );

      await expect(
        service.update(categoryId, { name: "Vitaminas" }, currentUser),
      ).rejects.toMatchObject({ status: 409 });
      expect(prismaMock.category.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    // Known defect (Contract API Sprint 4, §3.3): the conflict must carry the
    // CATEGORY_NAME_ALREADY_EXISTS code, as the create endpoint does.
    it.failing(
      "reports CATEGORY_NAME_ALREADY_EXISTS for a taken name",
      async () => {
        prismaMock.category.findUnique.mockImplementation(
          lookupOtherCategoryByName,
        );

        await expect(
          service.update(categoryId, { name: "Vitaminas" }, currentUser),
        ).rejects.toMatchObject({
          status: 409,
          response: { code: "CATEGORY_NAME_ALREADY_EXISTS" },
        });
      },
    );

    it("maps a unique constraint violation to a conflict", async () => {
      prismaMock.category.update.mockRejectedValue({ code: "P2002" });

      await expect(
        service.update(categoryId, { name: "Carrera" }, currentUser),
      ).rejects.toMatchObject({ status: 409 });
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("does not hide unexpected database errors", async () => {
      prismaMock.category.update.mockRejectedValue(
        new Error("connection lost"),
      );

      await expect(
        service.update(categoryId, { name: "Otra" }, currentUser),
      ).rejects.toThrow("connection lost");
    });

    it("sends only the name when only the name is provided", async () => {
      await service.update(
        categoryId,
        { name: "Proteínas Premium" },
        currentUser,
      );

      expect(prismaMock.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: categoryId },
          data: { name: "Proteínas Premium" },
        }),
      );
    });

    it("sends only the description when only the description is provided", async () => {
      await service.update(
        categoryId,
        { description: "Solo descripción" },
        currentUser,
      );

      expect(prismaMock.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: categoryId },
          data: { description: "Solo descripción" },
        }),
      );
      // Only the category itself is read: there is no name to check.
      expect(prismaMock.category.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { id: categoryId },
      });
    });

    it("checks the new name against the other categories", async () => {
      await service.update(categoryId, { name: "Vitaminas" }, currentUser);

      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { name: "Vitaminas" },
        select: { id: true },
      });
    });

    it("reads, writes and audits with the transaction client", async () => {
      const updated = buildCategory({ name: "Proteínas Premium" });
      const transactionClient = {
        category: {
          findUnique: jest.fn<AsyncMock>().mockImplementation((args) => {
            const { where } = args as NameLookup;
            return Promise.resolve(where.id === categoryId ? existing : null);
          }),
          update: jest.fn<AsyncMock>().mockResolvedValue(updated),
        },
      };
      prismaMock.$transaction.mockImplementation((operation) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : operation(transactionClient),
      );

      await service.update(
        categoryId,
        { name: "Proteínas Premium" },
        currentUser,
      );

      expect(transactionClient.category.findUnique).toHaveBeenCalledTimes(2);
      expect(transactionClient.category.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.category.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.category.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "UPDATE", entityId: categoryId }),
        transactionClient,
      );
    });

    it("does not audit when nothing changes", async () => {
      prismaMock.category.update.mockResolvedValue(existing);

      await service.update(
        categoryId,
        { name: "Proteínas", description: "Descripción anterior" },
        currentUser,
      );

      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("fails the update when the audit log cannot be written", async () => {
      prismaMock.category.update.mockResolvedValue(
        buildCategory({ name: "Proteínas Premium" }),
      );
      auditMock.createAuditLog.mockRejectedValue(new Error("audit down"));

      await expect(
        service.update(categoryId, { name: "Proteínas Premium" }, currentUser),
      ).rejects.toThrow("audit down");
    });

    // Known defect (Contract API Sprint 4, §3.2 and §3.3): the name must be
    // unique ignoring case, but the lookup is an exact match. The fakes behave
    // like the database: exact match for findUnique and a case-insensitive
    // match for a lookup done with findFirst or findMany.
    it.failing(
      "rejects a name that differs from another category only by case",
      async () => {
        const other = buildCategory({ id: otherCategoryId, name: "Vitaminas" });
        prismaMock.category.findUnique.mockImplementation((args) => {
          const { where } = args as NameLookup;
          if (where.id === categoryId) return Promise.resolve(existing);
          return Promise.resolve(where.name === other.name ? other : null);
        });
        const caseInsensitiveLookup = (args: unknown) => {
          const { where } = args as { where: { name: { equals: string } } };
          const matches =
            where.name.equals.toLowerCase() === other.name.toLowerCase();
          return matches ? other : null;
        };
        prismaMock.category.findFirst.mockImplementation((args) =>
          Promise.resolve(caseInsensitiveLookup(args)),
        );
        prismaMock.category.findMany.mockImplementation((args) => {
          const found = caseInsensitiveLookup(args);
          return Promise.resolve(found ? [found] : []);
        });

        await expect(
          service.update(categoryId, { name: "VITAMINAS" }, currentUser),
        ).rejects.toMatchObject({ status: 409 });
        expect(prismaMock.category.update).not.toHaveBeenCalled();
      },
    );
  });

  describe("updateStatus", () => {
    it("deactivates an active category and audits the transition", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: true }),
      );

      const result = await service.updateStatus(
        categoryId,
        false,
        currentUser,
        "127.0.0.1",
      );

      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: categoryId, active: true },
        data: { active: false },
      });
      expect(result).toEqual({
        message: "Category status updated successfully.",
      });
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "admin-user-id",
          action: "DEACTIVATE",
          entityId: categoryId,
          oldData: { active: true },
          newData: { active: false },
          reason: "Desactivación de la categoria Proteínas",
          ipAddress: "127.0.0.1",
        }),
        prismaMock,
      );
    });

    it("activates an inactive category and audits the transition", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: false }),
      );

      await service.updateStatus(categoryId, true, currentUser);

      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: categoryId, active: false },
        data: { active: true },
      });
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ACTIVATE",
          oldData: { active: false },
          newData: { active: true },
          reason: "Activación de la categoria Proteínas",
        }),
        prismaMock,
      );
    });

    // Regression guard (Contract API Sprint 4, §2.9): the status audit used to
    // be recorded against the CUSTOMER entity instead of CATEGORY.
    it("audits the status change against the CATEGORY entity", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: true }),
      );

      await service.updateStatus(categoryId, false, currentUser);

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ entity: "CATEGORY" }),
        prismaMock,
      );
    });

    it("rejects the request when the category is already in that state", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: false }),
      );

      await expect(
        service.updateStatus(categoryId, false, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "ALREADY_IN_STATE" },
      });
      expect(prismaMock.category.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("returns not found for a missing category", async () => {
      await expect(
        service.updateStatus(categoryId, false, currentUser),
      ).rejects.toMatchObject({ status: 404, message: "Category not found" });
      expect(prismaMock.category.update).not.toHaveBeenCalled();
    });

    it("reads the name and the current state of the category", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: true }),
      );

      await service.updateStatus(categoryId, false, currentUser);

      expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
        where: { id: categoryId },
        select: { name: true, description: true, active: true },
      });
    });

    it("rejects activating a category that is already active", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: true }),
      );

      await expect(
        service.updateStatus(categoryId, true, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: "ALREADY_IN_STATE",
          message: "Category is already in the requested state.",
        },
      });
      expect(prismaMock.category.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("updates and audits the status with the transaction client", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: true }),
      );
      const transactionClient = {
        category: {
          update: jest
            .fn<AsyncMock>()
            .mockResolvedValue(buildCategory({ active: false })),
        },
      };
      prismaMock.$transaction.mockImplementation((operation) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : operation(transactionClient),
      );

      await service.updateStatus(categoryId, false, currentUser);

      expect(transactionClient.category.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.category.update).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "DEACTIVATE" }),
        transactionClient,
      );
    });

    it("does not report success when the audit log cannot be written", async () => {
      prismaMock.category.findUnique.mockResolvedValue(
        buildCategory({ active: true }),
      );
      auditMock.createAuditLog.mockRejectedValue(new Error("audit down"));

      await expect(
        service.updateStatus(categoryId, false, currentUser),
      ).rejects.toThrow("audit down");
    });

    // Known defect (Contract API Sprint 4, §3.4): the update is conditioned on
    // the state that was read (`where: { id, active }`). When another request
    // changes the category in between, Prisma raises P2025 and nothing maps
    // it, so the client gets a 500 instead of 409 ALREADY_IN_STATE.
    it.failing(
      "answers ALREADY_IN_STATE when another request changed the state first",
      async () => {
        prismaMock.category.findUnique.mockResolvedValue(
          buildCategory({ active: true }),
        );
        prismaMock.category.update.mockRejectedValue({ code: "P2025" });

        await expect(
          service.updateStatus(categoryId, false, currentUser),
        ).rejects.toMatchObject({
          status: 409,
          response: { code: "ALREADY_IN_STATE" },
        });
        expect(auditMock.createAuditLog).not.toHaveBeenCalled();
      },
    );
  });
});
