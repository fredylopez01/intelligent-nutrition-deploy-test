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

// Shape returned by product.findUnique inside update's transaction
interface ExistingProductStub {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  unitOfMeasureId: string;
  price: MockDecimal;
}

// Shape returned by product.findUniqueOrThrow at the end of update's transaction
interface FinalProductStub {
  id: string;
  name: string;
  referenceCode: string;
  description: string | null;
  categoryId: string;
  unitOfMeasureId: string;
  price: MockDecimal;
  active: boolean;
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
    findUnique: jest.fn<AsyncMock>(),
    findUniqueOrThrow: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
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
const newCategoryId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const newUnitId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const createdAt = new Date("2026-10-07T15:30:00.000Z");
const updatedAt = new Date("2026-10-07T16:00:00.000Z");

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

function buildExistingProduct(
  overrides: Partial<ExistingProductStub> = {},
): ExistingProductStub {
  return {
    id: productId,
    name: "Proteína Whey",
    description: "Proteína de suero de alta calidad",
    categoryId,
    unitOfMeasureId: unitId,
    price: new MockDecimal("10.50"),
    ...overrides,
  };
}

function buildFinalProduct(
  overrides: Partial<FinalProductStub> = {},
): FinalProductStub {
  return {
    id: productId,
    name: "Proteína Whey",
    referenceCode: "PROT-001",
    description: "Proteína de suero de alta calidad",
    categoryId,
    unitOfMeasureId: unitId,
    price: new MockDecimal("10.50"),
    active: true,
    updatedAt,
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

// ---------------------------------------------------------------------------
// ProductsService > create
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ProductsService > update
// ---------------------------------------------------------------------------

describe("ProductsService > update", () => {
  let service: InstanceType<typeof ProductsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
    );
    prismaMock.product.findUnique.mockResolvedValue(buildExistingProduct());
    prismaMock.product.findUniqueOrThrow.mockResolvedValue(buildFinalProduct());
    prismaMock.product.update.mockResolvedValue(undefined);
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

  it("rejects an attempt to change the referenceCode", async () => {
    await expect(
      service.update(productId, { referenceCode: "NEW-001" }, currentUser),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "FIELD_NOT_EDITABLE" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when no editable fields are provided", async () => {
    await expect(
      service.update(productId, {}, currentUser),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "NO_FIELDS_TO_UPDATE" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the product does not exist", async () => {
    prismaMock.product.findUnique.mockResolvedValue(null);

    await expect(
      service.update(productId, { name: "Nuevo" }, currentUser),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "PRODUCT_NOT_FOUND" },
    });
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("updates the name and audits the change", async () => {
    await service.update(productId, { name: "Proteína Premium" }, currentUser, "127.0.0.1");

    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: productId },
      data: { name: "Proteína Premium" },
    });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      {
        userId: "admin-user-id",
        action: "UPDATE",
        entity: "PRODUCT",
        entityId: productId,
        oldData: { name: "Proteína Whey" },
        newData: { name: "Proteína Premium" },
        reason: "Actualización del producto Proteína Premium",
        ipAddress: "127.0.0.1",
      },
      prismaMock,
    );
  });

  it("audits only the changed fields, ignoring unchanged ones", async () => {
    // name changes, price is the same → only name appears in the delta
    await service.update(
      productId,
      { name: "Proteína Premium", price: "10.50" },
      currentUser,
    );

    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        oldData: { name: "Proteína Whey" },
        newData: { name: "Proteína Premium" },
      }),
      prismaMock,
    );
  });

  it('uses "Product price updated" as reason when the price changes', async () => {
    await service.update(productId, { price: "15.00" }, currentUser);

    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Product price updated" }),
      prismaMock,
    );
  });

  it("uses the new product name in the reason for non-price changes", async () => {
    await service.update(productId, { name: "Proteína Premium" }, currentUser);

    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Actualización del producto Proteína Premium",
      }),
      prismaMock,
    );
  });

  it("does not update or audit when the submitted values match the existing data", async () => {
    // Send the exact same name and price that already exist
    await service.update(
      productId,
      { name: "Proteína Whey", price: "10.50" },
      currentUser,
    );

    expect(prismaMock.product.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("always re-reads the product via findUniqueOrThrow after the operation", async () => {
    // Even when nothing changes the service must still re-read to return the current state
    await service.update(productId, { name: "Proteína Whey" }, currentUser);

    expect(prismaMock.product.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: productId } }),
    );
  });

  it("returns the final product state without primaryImageUrl or createdAt", async () => {
    prismaMock.product.findUniqueOrThrow.mockResolvedValue(buildFinalProduct());

    const result: unknown = await service.update(
      productId,
      { name: "Proteína Whey" },
      currentUser,
    );

    expect(result).toEqual({
      id: productId,
      name: "Proteína Whey",
      referenceCode: "PROT-001",
      description: "Proteína de suero de alta calidad",
      categoryId,
      unitOfMeasureId: unitId,
      price: "10.50",
      active: true,
      updatedAt,
    });
    expect((result as Record<string, unknown>).primaryImageUrl).toBeUndefined();
    expect((result as Record<string, unknown>).createdAt).toBeUndefined();
  });

  it("returns 404 when the new category does not exist", async () => {
    prismaMock.category.findUnique.mockResolvedValue(null);

    await expect(
      service.update(productId, { categoryId: newCategoryId }, currentUser),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "CATEGORY_NOT_FOUND" },
    });
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("returns 422 when the new category is inactive", async () => {
    prismaMock.category.findUnique.mockResolvedValue({
      id: newCategoryId,
      active: false,
    });

    await expect(
      service.update(productId, { categoryId: newCategoryId }, currentUser),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: "CATEGORY_INACTIVE" },
    });
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("does not validate the category when categoryId is not in the DTO", async () => {
    await service.update(productId, { name: "Nuevo nombre" }, currentUser);

    expect(prismaMock.category.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the new unit of measure does not exist", async () => {
    prismaMock.unitMeasure.findUnique.mockResolvedValue(null);

    await expect(
      service.update(productId, { unitOfMeasureId: newUnitId }, currentUser),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "UNIT_NOT_FOUND" },
    });
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("returns 422 when the new unit of measure is inactive", async () => {
    prismaMock.unitMeasure.findUnique.mockResolvedValue({
      id: newUnitId,
      active: false,
    });

    await expect(
      service.update(productId, { unitOfMeasureId: newUnitId }, currentUser),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: "UNIT_INACTIVE" },
    });
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("does not validate the unit when unitOfMeasureId is not in the DTO", async () => {
    await service.update(productId, { name: "Nuevo nombre" }, currentUser);

    expect(prismaMock.unitMeasure.findUnique).not.toHaveBeenCalled();
  });

  it("updates the category using the connect syntax", async () => {
    await service.update(productId, { categoryId: newCategoryId }, currentUser);

    const [[call]] = prismaMock.product.update.mock.calls as [
      [{ where: unknown; data: Record<string, unknown> }],
    ][];
    expect(call.data).toMatchObject({
      category: { connect: { id: newCategoryId } },
    });
  });

  it("updates the unit of measure using the connect syntax", async () => {
    await service.update(
      productId,
      { unitOfMeasureId: newUnitId },
      currentUser,
    );

    const [[call]] = prismaMock.product.update.mock.calls as [
      [{ where: unknown; data: Record<string, unknown> }],
    ][];
    expect(call.data).toMatchObject({
      unitOfMeasure: { connect: { id: newUnitId } },
    });
  });

  it("reads, writes and audits with the transaction client", async () => {
    const existing = buildExistingProduct();
    const final = buildFinalProduct();
    const transactionClient = {
      product: {
        findUnique: jest.fn<AsyncMock>().mockResolvedValue(existing),
        findUniqueOrThrow: jest.fn<AsyncMock>().mockResolvedValue(final),
        update: jest.fn<AsyncMock>().mockResolvedValue(undefined),
      },
      category: { findUnique: jest.fn<AsyncMock>() },
      unitMeasure: { findUnique: jest.fn<AsyncMock>() },
    };
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : operation(transactionClient),
    );

    await service.update(productId, { name: "Proteína Nueva" }, currentUser);

    expect(transactionClient.product.findUnique).toHaveBeenCalledTimes(1);
    expect(transactionClient.product.update).toHaveBeenCalledTimes(1);
    expect(transactionClient.product.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.product.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entity: "PRODUCT",
        entityId: productId,
      }),
      transactionClient,
    );
  });

  it("does not hide unexpected database errors", async () => {
    prismaMock.product.findUnique.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.update(productId, { name: "Nuevo" }, currentUser),
    ).rejects.toThrow("connection lost");
  });

  it("fails when the audit log cannot be written", async () => {
    auditMock.createAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(
      service.update(productId, { name: "Nuevo" }, currentUser),
    ).rejects.toThrow("audit down");
  });
});
