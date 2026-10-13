import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;

// Minimal Decimal stand-in: the service calls .toString() and .toFixed(2).
class MockDecimal {
  private value: string;
  constructor(val: string) {
    this.value = val;
  }
  toString() {
    return this.value;
  }
  toFixed(decimals: number) {
    return parseFloat(this.value).toFixed(decimals);
  }
}

interface ProductRecord {
  id: string;
  name: string;
  referenceCode: string;
  description: string | null;
  categoryId: string;
  unitOfMeasureId: string;
  price: MockDecimal;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CategoryStub {
  id: string;
  name: string;
  active: boolean;
}

interface UnitStub {
  id: string;
  name: string;
  active: boolean;
}

const prismaMock = {
  product: {
    findFirst: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
  category: {
    findUnique: jest.fn<AsyncMock>(),
  },
  unitMeasure: {
    findUnique: jest.fn<AsyncMock>(),
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

jest.unstable_mockModule("../../../generated/prisma/client.js", () => ({
  Prisma: { Decimal: MockDecimal },
}));

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { ProductsService } = await import("./products.service.js");
const { PrismaService } = await import(
  "../../database/prisma/prisma.service.js"
);
const { AuditService } = await import("../audit/audit.service.js");

const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const categoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const unitId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const createdAt = new Date("2026-10-07T15:30:00.000Z");

const currentUser: AuthenticatedUser = {
  id: "admin-user-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

function buildProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: productId,
    name: "Proteína Whey",
    referenceCode: "PROT-001",
    description: "Proteína de suero de alta calidad",
    categoryId,
    unitOfMeasureId: unitId,
    price: new MockDecimal("10.50"),
    active: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function buildCategory(overrides: Partial<CategoryStub> = {}): CategoryStub {
  return { id: categoryId, name: "Proteínas", active: true, ...overrides };
}

function buildUnit(overrides: Partial<UnitStub> = {}): UnitStub {
  return { id: unitId, name: "Kilogramo", active: true, ...overrides };
}

const validDto = {
  name: "Proteína Whey",
  referenceCode: "PROT-001",
  description: "Proteína de suero de alta calidad",
  categoryId,
  unitOfMeasureId: unitId,
  price: "10.50",
};

describe("ProductsService > create", () => {
  let service: InstanceType<typeof ProductsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
    );
    prismaMock.product.findFirst.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue(buildProduct());
    prismaMock.category.findUnique.mockResolvedValue(buildCategory());
    prismaMock.unitMeasure.findUnique.mockResolvedValue(buildUnit());
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it("creates the product and returns the mapped response", async () => {
    const product = buildProduct();
    prismaMock.product.create.mockResolvedValue(product);

    const result: unknown = await service.create(validDto, currentUser, "127.0.0.1");

    expect(result).toEqual({
      id: productId,
      name: "Proteína Whey",
      referenceCode: "PROT-001",
      description: "Proteína de suero de alta calidad",
      categoryId,
      unitOfMeasureId: unitId,
      price: "10.50",
      active: true,
      primaryImageUrl: null,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it("records the audit log with the product data serialized", async () => {
    const product = buildProduct();
    prismaMock.product.create.mockResolvedValue(product);

    await service.create(validDto, currentUser, "127.0.0.1");

    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      {
        userId: "admin-user-id",
        action: "CREATE",
        entity: "PRODUCT",
        entityId: productId,
        newData: {
          ...product,
          price: "10.50",
        },
        reason: "Creación del producto Proteína Whey (PROT-001)",
        ipAddress: "127.0.0.1",
      },
      prismaMock,
    );
  });

  it("passes the correct data to product.create", async () => {
    await service.create(validDto, currentUser);

    expect(prismaMock.product.create).toHaveBeenCalledWith({
      data: {
        name: "Proteína Whey",
        referenceCode: "PROT-001",
        description: "Proteína de suero de alta calidad",
        categoryId,
        unitOfMeasureId: unitId,
        price: expect.any(MockDecimal),
      },
    });
  });

  it("stores null when description is omitted", async () => {
    const { description: _desc, ...dtoWithoutDescription } = validDto;
    prismaMock.product.create.mockResolvedValue(buildProduct({ description: null }));

    await service.create(dtoWithoutDescription, currentUser);

    const [[call]] = prismaMock.product.create.mock.calls as [
      [{ data: Record<string, unknown> }],
    ][];
    expect(call.data.description).toBeNull();
  });

  it("formats the price with 2 decimal places in the response", async () => {
    prismaMock.product.create.mockResolvedValue(
      buildProduct({ price: new MockDecimal("5") }),
    );

    const result: unknown = await service.create(
      { ...validDto, price: "5" },
      currentUser,
    );

    expect((result as { price: string }).price).toBe("5.00");
  });

  it("always sets primaryImageUrl to null in the response", async () => {
    const result: unknown = await service.create(validDto, currentUser);

    expect((result as { primaryImageUrl: unknown }).primaryImageUrl).toBeNull();
  });

  it("rejects a duplicate referenceCode", async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: "other-product-id" });

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "PRODUCT_REFERENCE_CODE_ALREADY_EXISTS" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("checks the referenceCode with a case-insensitive query", async () => {
    await service.create(validDto, currentUser);

    expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
      where: {
        referenceCode: { equals: "PROT-001", mode: "insensitive" },
      },
      select: { id: true },
    });
  });

  it("returns 404 when the category does not exist", async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "CATEGORY_NOT_FOUND" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 422 when the category is inactive", async () => {
    prismaMock.category.findUnique.mockResolvedValue(
      buildCategory({ active: false }),
    );

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: "CATEGORY_INACTIVE" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the unit of measure does not exist", async () => {
    prismaMock.unitMeasure.findUnique.mockResolvedValue(null);

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "UNIT_NOT_FOUND" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 422 when the unit of measure is inactive", async () => {
    prismaMock.unitMeasure.findUnique.mockResolvedValue(
      buildUnit({ active: false }),
    );

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: "UNIT_INACTIVE" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("maps a P2002 unique constraint violation to PRODUCT_REFERENCE_CODE_ALREADY_EXISTS", async () => {
    prismaMock.product.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "PRODUCT_REFERENCE_CODE_ALREADY_EXISTS" },
    });
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("does not hide unexpected database errors", async () => {
    prismaMock.product.create.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toThrow("connection lost");
  });

  it("does not audit when the product insert fails", async () => {
    prismaMock.product.create.mockRejectedValue(new Error("insert failed"));

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toThrow("insert failed");
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("fails the creation when the audit log cannot be written", async () => {
    auditMock.createAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(
      service.create(validDto, currentUser),
    ).rejects.toThrow("audit down");
  });

  it("creates and audits with the transaction client", async () => {
    const product = buildProduct();
    const transactionClient = {
      product: {
        create: jest.fn<AsyncMock>().mockResolvedValue(product),
      },
    };
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : operation(transactionClient),
    );

    await service.create(validDto, currentUser);

    expect(transactionClient.product.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        entity: "PRODUCT",
        entityId: productId,
      }),
      transactionClient,
    );
  });
});
