import { jest, describe, beforeEach, it, expect } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

interface PaymentMethodRecord {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const prismaMock = {
  $transaction: jest.fn<AsyncMock>(),
  paymentMethod: {
    findUnique: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    count: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
  },
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { PaymentMethodsService } = await import("./payment-methods.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");

const createdAt = new Date("2026-10-21T13:30:00.000Z");

function buildPaymentMethod(
  overrides: Partial<PaymentMethodRecord> = {},
): PaymentMethodRecord {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    code: "NEQUI",
    name: "Nequi",
    active: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject");
}

describe("PaymentMethodsService", () => {
  let service: InstanceType<typeof PaymentMethodsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operations) =>
      Promise.all(operations as Promise<unknown>[]),
    );
    prismaMock.paymentMethod.count.mockResolvedValue(0);
    prismaMock.paymentMethod.findMany.mockResolvedValue([]);
    prismaMock.paymentMethod.findUnique.mockResolvedValue(null);
    prismaMock.paymentMethod.create.mockResolvedValue(buildPaymentMethod());

    const module = await Test.createTestingModule({
      providers: [
        PaymentMethodsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(PaymentMethodsService);
  });

  describe("create", () => {
    it("creates the payment method and returns the selected fields", async () => {
      const paymentMethod = buildPaymentMethod();
      prismaMock.paymentMethod.create.mockResolvedValue(paymentMethod);

      const result: unknown = await service.create({
        code: "NEQUI",
        name: "Nequi",
      });

      expect(prismaMock.paymentMethod.create).toHaveBeenCalledWith({
        data: { code: "NEQUI", name: "Nequi" },
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(result).toBe(paymentMethod);
    });

    it("leaves the active flag to the database default", async () => {
      await service.create({ code: "NEQUI", name: "Nequi" });

      const [{ data }] = prismaMock.paymentMethod.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(data).not.toHaveProperty("active");
      expect(data).toEqual({ code: "NEQUI", name: "Nequi" });
    });

    it("checks the code before inserting", async () => {
      await service.create({ code: "NEQUI", name: "Nequi" });

      expect(prismaMock.paymentMethod.findUnique).toHaveBeenCalledWith({
        where: { code: "NEQUI" },
        select: { id: true },
      });
      const lookupOrder =
        prismaMock.paymentMethod.findUnique.mock.invocationCallOrder[0];
      const createOrder =
        prismaMock.paymentMethod.create.mock.invocationCallOrder[0];
      expect(lookupOrder).toBeLessThan(createOrder);
    });

    it("rejects a code that already exists", async () => {
      prismaMock.paymentMethod.findUnique.mockResolvedValue({
        id: buildPaymentMethod().id,
      });

      await expect(
        service.create({ code: "NEQUI", name: "Nequi" }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: "PAYMENT_METHOD_CODE_ALREADY_EXISTS",
          message: "A payment method with this code already exists.",
          details: {},
        },
      });
      expect(prismaMock.paymentMethod.create).not.toHaveBeenCalled();
    });

    it("maps a unique constraint violation to a code conflict", async () => {
      prismaMock.paymentMethod.create.mockRejectedValue({ code: "P2002" });

      await expect(
        service.create({ code: "NEQUI", name: "Nequi" }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "PAYMENT_METHOD_CODE_ALREADY_EXISTS" },
      });
    });

    it("does not hide unexpected database errors", async () => {
      const error = new Error("connection lost");
      prismaMock.paymentMethod.create.mockRejectedValue(error);

      await expect(
        service.create({ code: "NEQUI", name: "Nequi" }),
      ).rejects.toBe(error);
    });

    it.each([
      ["a foreign key error", { code: "P2003" }],
      ["a record not found error", { code: "P2025" }],
      ["an object without a code", { message: "unknown" }],
      ["a plain string", "database down"],
      ["null", null],
    ])("does not map %s to a code conflict", async (_label, rejection) => {
      prismaMock.paymentMethod.create.mockRejectedValue(rejection);

      const error = await rejectionOf(
        service.create({ code: "NEQUI", name: "Nequi" }),
      );

      expect(error).toBe(rejection);
    });
  });

  describe("findAll", () => {
    const defaultQuery = { page: 1, limit: 10 };

    it("returns the page of payment methods with its metadata", async () => {
      const rows = [
        buildPaymentMethod(),
        buildPaymentMethod({
          id: "66666666-6666-4666-8666-666666666666",
          code: "CARD",
          name: "Tarjeta",
        }),
      ];
      prismaMock.paymentMethod.count.mockResolvedValue(rows.length);
      prismaMock.paymentMethod.findMany.mockResolvedValue(rows);

      const result = await service.findAll(defaultQuery);

      expect(result).toEqual({
        data: rows,
        meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
      });
    });

    it("computes skip and take from the page and limit", async () => {
      await service.findAll({ page: 3, limit: 5 });

      const [{ skip, take }] = prismaMock.paymentMethod.findMany.mock
        .calls[0] as [{ skip: number; take: number }];
      expect(skip).toBe(10);
      expect(take).toBe(5);
    });

    it("orders by name and then by code", async () => {
      await service.findAll(defaultQuery);

      const [{ orderBy }] = prismaMock.paymentMethod.findMany.mock.calls[0] as [
        { orderBy: unknown },
      ];
      expect(orderBy).toEqual([{ name: "asc" }, { code: "asc" }]);
    });

    it("selects the public fields", async () => {
      await service.findAll(defaultQuery);

      const [{ select }] = prismaMock.paymentMethod.findMany.mock.calls[0] as [
        { select: unknown },
      ];
      expect(select).toEqual({
        id: true,
        code: true,
        name: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      });
    });

    it("uses an empty filter when there are no query params", async () => {
      await service.findAll(defaultQuery);

      expect(prismaMock.paymentMethod.count).toHaveBeenCalledWith({
        where: {},
      });
      expect(prismaMock.paymentMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it.each([true, false])("filters by active %s", async (active) => {
      await service.findAll({ ...defaultQuery, active });

      expect(prismaMock.paymentMethod.count).toHaveBeenCalledWith({
        where: { active },
      });
      expect(prismaMock.paymentMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active } }),
      );
    });

    it("searches by code and name ignoring case", async () => {
      const expectedWhere = {
        OR: [
          { code: { contains: "ne", mode: "insensitive" } },
          { name: { contains: "ne", mode: "insensitive" } },
        ],
      };

      await service.findAll({ ...defaultQuery, search: "ne" });

      expect(prismaMock.paymentMethod.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
      expect(prismaMock.paymentMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
    });

    it("combines the active filter with the search", async () => {
      const expectedWhere = {
        active: true,
        OR: [
          { code: { contains: "ne", mode: "insensitive" } },
          { name: { contains: "ne", mode: "insensitive" } },
        ],
      };

      await service.findAll({ ...defaultQuery, active: true, search: "ne" });

      expect(prismaMock.paymentMethod.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it("does not filter when the search is empty", async () => {
      await service.findAll({ ...defaultQuery, search: "" });

      expect(prismaMock.paymentMethod.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it.each([
      [0, 0],
      [10, 1],
      [11, 2],
      [21, 3],
    ])("computes totalPages for %i records", async (total, totalPages) => {
      prismaMock.paymentMethod.count.mockResolvedValue(total);

      const result = await service.findAll(defaultQuery);

      expect(result.meta).toEqual({ page: 1, limit: 10, total, totalPages });
    });

    it("reads the count and the page in a single transaction", async () => {
      await service.findAll(defaultQuery);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      const [operations] = prismaMock.$transaction.mock.calls[0] as [unknown[]];
      expect(operations).toHaveLength(2);
    });
  });
});
