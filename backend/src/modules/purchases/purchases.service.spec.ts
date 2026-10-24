import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;

const transactionMock = {
  supplier: { findUnique: jest.fn<AsyncMock>() },
  product: { findMany: jest.fn<AsyncMock>() },
  purchase: {
    findFirst: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
};

const prismaMock = {
  purchase: {
    count: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
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

const { Test } = await import("@nestjs/testing");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { PurchasesService } = await import("./purchases.service.js");

const currentUser: AuthenticatedUser = {
  id: "user-superadmin",
  active: true,
  role: { name: "SUPERADMIN" },
};

const purchaseDto = {
  supplierId: "supplier-1",
  observation: "Compra de prueba",
  items: [
    {
      productId: "product-1",
      requestedQuantity: 2,
      unitPrice: "12.35",
      observation: "Primero",
    },
    {
      productId: "product-2",
      requestedQuantity: 3,
      unitPrice: "0.10",
    },
  ],
};

describe("PurchasesService.create", () => {
  let service: InstanceType<typeof PurchasesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : operation(transactionMock),
    );
    transactionMock.supplier.findUnique.mockResolvedValue({
      personId: "supplier-1",
      active: true,
    });
    transactionMock.product.findMany.mockResolvedValue([
      { id: "product-1", active: true, name: "Producto uno" },
      { id: "product-2", active: true, name: "Producto dos" },
    ]);
    transactionMock.purchase.findFirst.mockResolvedValue(null);
    transactionMock.purchase.create.mockResolvedValue({
      id: "purchase-1",
      purchaseNumber: "C-20261024-0001",
      status: "PENDING_RECEIPT",
      purchaseAt: new Date("2026-10-24T12:00:00.000Z"),
      subtotal: 25,
      total: 25,
      observation: "Compra de prueba",
      createdAt: new Date("2026-10-24T12:00:00.000Z"),
      updatedAt: new Date("2026-10-24T12:00:00.000Z"),
      supplier: {
        personId: "supplier-1",
        commercialName: "Proveedor Uno",
        person: { businessName: null },
      },
      user: {
        personId: currentUser.id,
        person: { firstName: "Ana", lastName: "Pruebas" },
      },
      details: [
        {
          id: "detail-1",
          productId: "product-1",
          requestedQuantity: 2,
          receivedQuantity: 0,
          unitPrice: 12.35,
          subtotal: 24.7,
          received: false,
          observation: "Primero",
          product: { name: "Producto uno", referenceCode: "P-001" },
        },
        {
          id: "detail-2",
          productId: "product-2",
          requestedQuantity: 3,
          receivedQuantity: 0,
          unitPrice: 0.1,
          subtotal: 0.3,
          received: false,
          observation: null,
          product: { name: "Producto dos", referenceCode: "P-002" },
        },
      ],
    });
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(PurchasesService);
  });

  it("creates the purchase and calculates detail subtotals and total", async () => {
    const result = await service.create(purchaseDto, currentUser, "127.0.0.1");

    expect(transactionMock.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierId: "supplier-1",
          userId: currentUser.id,
          subtotal: 25,
          total: 25,
          observation: "Compra de prueba",
          details: {
            create: [
              {
                productId: "product-1",
                requestedQuantity: 2,
                receivedQuantity: 0,
                unitPrice: 12.35,
                subtotal: 24.7,
                received: false,
                observation: "Primero",
              },
              {
                productId: "product-2",
                requestedQuantity: 3,
                receivedQuantity: 0,
                unitPrice: 0.1,
                subtotal: 0.3,
                received: false,
                observation: null,
              },
            ],
          },
        }),
        select: expect.any(Object),
      }),
    );
    expect(result).toMatchObject({
      id: "purchase-1",
      supplier: { id: "supplier-1", commercialName: "Proveedor Uno" },
      user: { id: currentUser.id, fullName: "Ana Pruebas" },
      subtotal: "25.00",
      total: "25.00",
      items: [
        {
          productId: "product-1",
          productName: "Producto uno",
          unitPrice: "12.35",
          subtotal: "24.70",
        },
        {
          productId: "product-2",
          productName: "Producto dos",
          unitPrice: "0.10",
          subtotal: "0.30",
        },
      ],
    });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: currentUser.id,
        action: "CREATE",
        entity: "PURCHASE",
        entityId: "purchase-1",
        newData: expect.objectContaining({
          subtotal: "25.00",
          total: "25.00",
          itemsCount: 2,
        }),
        ipAddress: "127.0.0.1",
      }),
      transactionMock,
    );
  });

  it("throws SUPPLIER_NOT_FOUND and does not create a purchase", async () => {
    transactionMock.supplier.findUnique.mockResolvedValue(null);

    await expect(
      service.create(purchaseDto, currentUser),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "SUPPLIER_NOT_FOUND" },
    });

    expect(transactionMock.product.findMany).not.toHaveBeenCalled();
    expect(transactionMock.purchase.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("throws PRODUCT_NOT_FOUND when an item references a missing product", async () => {
    transactionMock.product.findMany.mockResolvedValue([
      { id: "product-1", active: true, name: "Producto uno" },
    ]);

    await expect(
      service.create(purchaseDto, currentUser),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        code: "PRODUCT_NOT_FOUND",
        message: "Product product-2 not found.",
      },
    });

    expect(transactionMock.purchase.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });
});

describe("PurchasesService.findAll", () => {
  let service: InstanceType<typeof PurchasesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : operation(transactionMock),
    );
    prismaMock.purchase.count.mockResolvedValue(7);
    prismaMock.purchase.findMany.mockResolvedValue([
      {
        id: "purchase-1",
        purchaseNumber: "C-20261024-0001",
        status: "PARTIALLY_RECEIVED",
        purchaseAt: new Date("2026-10-24T10:00:00.000Z"),
        total: 25.5,
        supplier: {
          personId: "supplier-1",
          commercialName: "Proveedor Uno",
          person: { businessName: null },
        },
        _count: { details: 2 },
      },
    ]);

    const module = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(PurchasesService);
  });

  it("lists purchases with the requested filters, pagination, and descending date order", async () => {
    const query = {
      page: 2,
      limit: 5,
      supplierId: "supplier-1",
      status: "PARTIALLY_RECEIVED",
      from: "2026-10-01",
      to: "2026-10-24",
      productId: "product-1",
      search: "c-2",
    };

    const result = await service.findAll(query);

    const expectedWhere = {
      supplierId: "supplier-1",
      status: "PARTIALLY_RECEIVED",
      purchaseNumber: { contains: "c-2", mode: "insensitive" },
      purchaseAt: {
        gte: new Date("2026-10-01T00:00:00Z"),
        lte: new Date("2026-10-24T23:59:59.999Z"),
      },
      details: { some: { productId: "product-1" } },
    };
    expect(prismaMock.purchase.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(prismaMock.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 5,
        take: 5,
        orderBy: { purchaseAt: "desc" },
      }),
    );
    expect(result).toMatchObject({
      data: [
        {
          id: "purchase-1",
          purchaseNumber: "C-20261024-0001",
          status: "PARTIALLY_RECEIVED",
          supplier: {
            id: "supplier-1",
            commercialName: "Proveedor Uno",
            businessName: null,
          },
          total: "25.50",
          itemsCount: 2,
        },
      ],
      meta: { page: 2, limit: 5, total: 7, totalPages: 2 },
    });
  });

  it("filters by purchase status", async () => {
    await service.findAll({
      page: 1,
      limit: 20,
      status: "FULLY_RECEIVED",
    });

    expect(prismaMock.purchase.count).toHaveBeenCalledWith({
      where: { status: "FULLY_RECEIVED" },
    });
    expect(prismaMock.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "FULLY_RECEIVED" },
      }),
    );
  });
});

describe("PurchasesService.findOne", () => {
  let service: InstanceType<typeof PurchasesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(PurchasesService);
  });

  it("returns the purchase details for the requested id", async () => {
    prismaMock.purchase.findUnique.mockResolvedValue({
      id: "purchase-1",
      purchaseNumber: "C-20261024-0001",
      status: "PENDING_RECEIPT",
      purchaseAt: new Date("2026-10-24T10:00:00.000Z"),
      subtotal: 20,
      total: 20,
      observation: null,
      createdAt: new Date("2026-10-24T10:00:00.000Z"),
      updatedAt: new Date("2026-10-24T10:00:00.000Z"),
      supplier: {
        personId: "supplier-1",
        commercialName: "Proveedor Uno",
        person: { businessName: null },
      },
      user: {
        personId: currentUser.id,
        person: { firstName: "Ana", lastName: "Pruebas" },
      },
      details: [
        {
          id: "detail-1",
          productId: "product-1",
          requestedQuantity: 2,
          receivedQuantity: 0,
          unitPrice: 10,
          subtotal: 20,
          received: false,
          observation: null,
          product: { name: "Producto uno", referenceCode: "P-001" },
        },
      ],
    });

    const result = await service.findOne("purchase-1");

    expect(prismaMock.purchase.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "purchase-1" },
        select: expect.any(Object),
      }),
    );
    expect(result).toMatchObject({
      id: "purchase-1",
      purchaseNumber: "C-20261024-0001",
      supplier: { id: "supplier-1", commercialName: "Proveedor Uno" },
      user: { id: currentUser.id, fullName: "Ana Pruebas" },
      subtotal: "20.00",
      total: "20.00",
      items: [
        {
          id: "detail-1",
          productId: "product-1",
          productName: "Producto uno",
          referenceCode: "P-001",
          requestedQuantity: 2,
          unitPrice: "10.00",
          subtotal: "20.00",
        },
      ],
    });
  });

  it("throws PURCHASE_NOT_FOUND when the id does not exist", async () => {
    prismaMock.purchase.findUnique.mockResolvedValue(null);

    await expect(service.findOne("missing-purchase")).rejects.toMatchObject({
      status: 404,
      response: { code: "PURCHASE_NOT_FOUND" },
    });
  });
});
