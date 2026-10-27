import "reflect-metadata";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ValidationPipe } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { ListSalesQueryDto } from "./dto/list-sales-query.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const lowStockMock = {
  levels: async () => new Map(),
  notifyCrossings: async () => 0,
};

const saleId = "99999999-9999-4999-8999-999999999999";
const branchId = "11111111-1111-4111-8111-111111111111";
const otherBranchId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const customerId = "88888888-8888-4888-8888-888888888888";
const cashMethodId = "66666666-6666-4666-8666-666666666666";

const saleAt = new Date("2026-10-26T15:30:00.000Z");
const reversedAt = new Date("2026-10-27T09:00:00.000Z");

const prismaMock = {
  $transaction: jest.fn<(ops: Promise<unknown>[]) => Promise<unknown[]>>(),
  sale: {
    count: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    findUnique: jest.fn<AsyncMock>(),
  },
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { LowStockService } =
  await import("../notifications/low-stock.service.js");
const { SalesService } = await import("./sales.service.js");
const { SalesController } = await import("./sales.controller.js");
const { Reflector } = await import("@nestjs/core");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const { ROLES_KEY } =
  await import("../../common/decorators/roles.decorator.js");

const superadminUser: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const leaderUser: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: branchId, name: "Sede Centro" }],
};

const listSaleRecord = {
  id: saleId,
  saleNumber: "V-20261026-0001",
  status: "COMPLETED",
  saleAt,
  subtotal: "24.70",
  discountAmount: "0.00",
  taxAmount: "0.00",
  total: "24.70",
  reversalReason: null,
  reversedAt: null,
  branch: { id: branchId, name: "Sede Centro" },
  user: {
    personId: userId,
    person: { firstName: "Ana", lastName: "Pruebas" },
  },
  customer: { personId: customerId, fullName: "Carlos Cliente" },
  _count: { details: 2 },
};

const detailSaleRecord = {
  id: saleId,
  saleNumber: "V-20261026-0001",
  status: "COMPLETED",
  saleAt,
  subtotal: "24.70",
  discountAmount: "1.20",
  taxAmount: "0.00",
  total: "23.50",
  reversalReason: null,
  reversedAt: null,
  branch: { id: branchId, name: "Sede Centro" },
  user: {
    personId: userId,
    person: { firstName: "Ana", lastName: "Pruebas" },
  },
  customer: null,
  details: [
    {
      productId,
      quantity: 2,
      unitPrice: "12.35",
      subtotal: "24.70",
      discountAmount: "1.20",
      taxAmount: "0.00",
      total: "23.50",
      product: { name: "Proteína", referenceCode: "P-001" },
    },
  ],
  payments: [
    {
      amount: "23.50",
      reference: "TRX-001",
      paidAt: saleAt,
      paymentMethod: { id: cashMethodId, code: "CASH", name: "Efectivo" },
    },
  ],
};

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function validateQuery(query: Record<string, unknown>) {
  return validationPipe.transform(query, {
    type: "query",
    metatype: ListSalesQueryDto,
  }) as Promise<ListSalesQueryDto>;
}

describe("SalesService read operations (GET /sales)", () => {
  let service: InstanceType<typeof SalesService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );
    prismaMock.sale.count.mockResolvedValue(0);
    prismaMock.sale.findMany.mockResolvedValue([]);
    prismaMock.sale.findUnique.mockResolvedValue(null);

    testingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: LowStockService, useValue: lowStockMock },
      ],
    }).compile();
    service = testingModule.get(SalesService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  describe("findAll", () => {
    it("lists sales with branch, status, customer, product and search filters", async () => {
      prismaMock.sale.count.mockResolvedValue(1);
      prismaMock.sale.findMany.mockResolvedValue([listSaleRecord]);

      const query = {
        page: 1,
        limit: 20,
        branchId,
        status: "COMPLETED",
        customerId,
        productId,
        search: "V-20261026",
      } as ListSalesQueryDto;

      const result = await service.findAll(query, superadminUser);

      expect(prismaMock.sale.count).toHaveBeenCalledWith({
        where: {
          branchId,
          status: "COMPLETED",
          customerId,
          details: { some: { productId } },
          saleNumber: { contains: "V-20261026", mode: "insensitive" },
        },
      });
      expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            branchId,
            status: "COMPLETED",
            customerId,
            details: { some: { productId } },
            saleNumber: { contains: "V-20261026", mode: "insensitive" },
          },
          skip: 0,
          take: 20,
          orderBy: { saleAt: "desc" },
        }),
      );
      expect(result).toEqual({
        data: [
          {
            id: saleId,
            saleNumber: "V-20261026-0001",
            status: "COMPLETED",
            branch: { id: branchId, name: "Sede Centro" },
            user: { id: userId, fullName: "Ana Pruebas" },
            customer: { id: customerId, fullName: "Carlos Cliente" },
            saleAt,
            subtotal: "24.70",
            discountAmount: "0.00",
            taxAmount: "0.00",
            total: "24.70",
            reversalReason: null,
            reversedAt: null,
            itemsCount: 2,
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it("uses an empty where clause when no filters are provided", async () => {
      await service.findAll({ page: 1, limit: 20 }, superadminUser);

      expect(prismaMock.sale.count).toHaveBeenCalledWith({ where: {} });
      expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it("filters by from and to dates with UTC day boundaries", async () => {
      await service.findAll(
        {
          page: 1,
          limit: 20,
          from: "2026-10-01",
          to: "2026-10-31",
        },
        superadminUser,
      );

      expect(prismaMock.sale.count).toHaveBeenCalledWith({
        where: {
          saleAt: {
            gte: new Date("2026-10-01T00:00:00Z"),
            lte: new Date("2026-10-31T23:59:59.999Z"),
          },
        },
      });
      expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            saleAt: {
              gte: new Date("2026-10-01T00:00:00Z"),
              lte: new Date("2026-10-31T23:59:59.999Z"),
            },
          },
        }),
      );
    });

    it("applies only the provided date boundary", async () => {
      await service.findAll(
        { page: 1, limit: 20, from: "2026-10-01" },
        superadminUser,
      );

      expect(prismaMock.sale.count).toHaveBeenCalledWith({
        where: { saleAt: { gte: new Date("2026-10-01T00:00:00Z") } },
      });

      jest.clearAllMocks();
      prismaMock.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );

      await service.findAll(
        { page: 1, limit: 20, to: "2026-10-31" },
        superadminUser,
      );

      expect(prismaMock.sale.count).toHaveBeenCalledWith({
        where: { saleAt: { lte: new Date("2026-10-31T23:59:59.999Z") } },
      });
    });

    it("paginates results and computes meta.totalPages", async () => {
      prismaMock.sale.count.mockResolvedValue(25);
      prismaMock.sale.findMany.mockResolvedValue([listSaleRecord]);

      const result = await service.findAll(
        { page: 3, limit: 10 },
        superadminUser,
      );

      expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
          orderBy: { saleAt: "desc" },
        }),
      );
      expect(result.meta).toEqual({
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it("returns totalPages 0 when there are no matching sales", async () => {
      const result = await service.findAll(
        { page: 1, limit: 20 },
        superadminUser,
      );

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it("rejects BRANCH_LEADER listing without branchId", async () => {
      await expect(
        service.findAll({ page: 1, limit: 20 }, leaderUser),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: "BRANCH_REQUIRED" },
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("rejects BRANCH_LEADER listing a branch outside its scope", async () => {
      await expect(
        service.findAll(
          { page: 1, limit: 20, branchId: otherBranchId },
          leaderUser,
        ),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: "BRANCH_OUT_OF_SCOPE" },
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("allows BRANCH_LEADER to list sales of its own branch", async () => {
      await service.findAll({ page: 1, limit: 20, branchId }, leaderUser);

      expect(prismaMock.sale.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { branchId } }),
      );
    });
  });

  describe("findOne", () => {
    it("returns the sale detail formatted for the API", async () => {
      prismaMock.sale.findUnique.mockResolvedValue(detailSaleRecord);

      const result = await service.findOne(saleId, superadminUser);

      expect(prismaMock.sale.findUnique).toHaveBeenCalledWith({
        where: { id: saleId },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        id: saleId,
        saleNumber: "V-20261026-0001",
        status: "COMPLETED",
        branch: { id: branchId, name: "Sede Centro" },
        user: { id: userId, fullName: "Ana Pruebas" },
        customer: null,
        saleAt,
        subtotal: "24.70",
        discountAmount: "1.20",
        taxAmount: "0.00",
        total: "23.50",
        items: [
          {
            productId,
            productName: "Proteína",
            referenceCode: "P-001",
            quantity: 2,
            unitPrice: "12.35",
            subtotal: "24.70",
            discountAmount: "1.20",
            taxAmount: "0.00",
            total: "23.50",
          },
        ],
        payments: [
          {
            paymentMethod: { id: cashMethodId, code: "CASH", name: "Efectivo" },
            amount: "23.50",
            reference: "TRX-001",
            paidAt: saleAt,
          },
        ],
        reversalReason: null,
        reversedAt: null,
      });
    });

    it("exposes reversal data when the sale is reversed", async () => {
      prismaMock.sale.findUnique.mockResolvedValue({
        ...detailSaleRecord,
        status: "REVERSED",
        reversalReason: "Customer returned the full purchase",
        reversedAt,
      });

      const result = await service.findOne(saleId, superadminUser);

      expect(result).toMatchObject({
        status: "REVERSED",
        reversalReason: "Customer returned the full purchase",
        reversedAt,
      });
    });

    it("throws SALE_NOT_FOUND when the sale does not exist", async () => {
      prismaMock.sale.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(saleId, superadminUser),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "SALE_NOT_FOUND" },
      });
    });

    it("allows BRANCH_LEADER to read a sale of its own branch", async () => {
      prismaMock.sale.findUnique.mockResolvedValue(detailSaleRecord);

      const result = await service.findOne(saleId, leaderUser);

      expect(result.id).toBe(saleId);
    });

    it("rejects BRANCH_LEADER reading a sale from another branch", async () => {
      prismaMock.sale.findUnique.mockResolvedValue({
        ...detailSaleRecord,
        branch: { id: otherBranchId, name: "Sede Norte" },
      });

      await expect(service.findOne(saleId, leaderUser)).rejects.toMatchObject({
        status: 403,
        response: { code: "BRANCH_OUT_OF_SCOPE" },
      });
    });
  });
});

describe("GET /sales query validation", () => {
  it("accepts valid filters and applies defaults", async () => {
    const query = await validateQuery({
      branchId,
      status: "COMPLETED",
      from: "2026-10-01",
      to: "2026-10-31",
      search: "  V-20261026  ",
    });

    expect(query).toMatchObject({
      page: 1,
      limit: 20,
      branchId,
      status: "COMPLETED",
      from: "2026-10-01",
      to: "2026-10-31",
      search: "V-20261026",
    });
  });

  it("rejects from/to values that are not YYYY-MM-DD", async () => {
    await expect(validateQuery({ from: "01/10/2026" })).rejects.toBeDefined();
    await expect(validateQuery({ to: "31-10-2026" })).rejects.toBeDefined();
  });

  it("rejects unsupported status values", async () => {
    await expect(validateQuery({ status: "CANCELLED" })).rejects.toBeDefined();
  });
});

describe("GET /sales role guards", () => {
  const guard = new RolesGuard(new Reflector());

  function endpointWithRoles(methodName: "findAll" | "findOne") {
    const method: unknown = Object.getOwnPropertyDescriptor(
      SalesController.prototype,
      methodName,
    )?.value;
    if (typeof method !== "function") {
      throw new Error(`SalesController.${methodName} handler is missing`);
    }

    const metadata: unknown = Reflect.getMetadata(ROLES_KEY, method);
    if (
      !Array.isArray(metadata) ||
      metadata.some((role: unknown) => typeof role !== "string")
    ) {
      throw new Error(`SalesController.${methodName} roles are missing`);
    }

    const roles = metadata as string[];
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, roles, handler);
    return { handler, roles };
  }

  const listEndpoint = endpointWithRoles("findAll");
  const detailEndpoint = endpointWithRoles("findOne");

  const contextFor = (
    handler: () => undefined,
    user?: AuthenticatedUser,
  ): ExecutionContext =>
    ({
      getArgs: () => [{ user }],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({
        getData: () => undefined,
        getContext: () => undefined,
      }),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => undefined,
        getNext: () => undefined,
      }),
      switchToWs: () => ({
        getClient: () => undefined,
        getData: () => undefined,
        getPattern: () => "",
      }),
      getType: () => "http",
      getClass: () => SalesController,
      getHandler: () => handler,
    }) as ExecutionContext;

  it("configures the expected roles on list and detail endpoints", () => {
    expect(listEndpoint.roles).toEqual([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
    expect(detailEndpoint.roles).toEqual([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
  });

  it.each(["findAll", "findOne"] as const)(
    "allows sales roles to call %s",
    (methodName) => {
      const endpoint = methodName === "findAll" ? listEndpoint : detailEndpoint;

      for (const roleName of endpoint.roles) {
        const user: AuthenticatedUser = {
          id: userId,
          active: true,
          role: { name: roleName },
        };

        expect(guard.canActivate(contextFor(endpoint.handler, user))).toBe(
          true,
        );
      }
    },
  );

  it.each(["findAll", "findOne"] as const)(
    "denies roles without sales permission on %s",
    (methodName) => {
      const endpoint = methodName === "findAll" ? listEndpoint : detailEndpoint;
      const user: AuthenticatedUser = {
        id: userId,
        active: true,
        role: { name: "DEV" },
      };

      expect(() =>
        guard.canActivate(contextFor(endpoint.handler, user)),
      ).toThrow(
        expect.objectContaining({
          status: 403,
          response: expect.objectContaining({
            code: "INSUFFICIENT_PERMISSIONS",
          }),
        }),
      );
    },
  );

  it.each(["findAll", "findOne"] as const)(
    "denies inactive users even with an allowed role on %s",
    (methodName) => {
      const endpoint = methodName === "findAll" ? listEndpoint : detailEndpoint;
      const user: AuthenticatedUser = {
        id: userId,
        active: false,
        role: { name: "SUPERADMIN" },
      };

      expect(() =>
        guard.canActivate(contextFor(endpoint.handler, user)),
      ).toThrow(
        expect.objectContaining({
          status: 403,
          response: expect.objectContaining({
            code: "INSUFFICIENT_PERMISSIONS",
          }),
        }),
      );
    },
  );

  it("denies requests without an authenticated user", () => {
    expect(() => guard.canActivate(contextFor(listEndpoint.handler))).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: "INSUFFICIENT_PERMISSIONS",
        }),
      }),
    );
  });
});
