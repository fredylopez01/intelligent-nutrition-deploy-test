import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { LowStockService } from "../notifications/low-stock.service.js";
import { GeneralStockService } from "../general-stock/general-stock.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;

const transactionMock = {
  supplier: { findUnique: jest.fn<AsyncMock>() },
  product: { findMany: jest.fn<AsyncMock>() },
  purchase: {
    findFirst: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    findUnique: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  purchaseDetail: {
    update: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
  },
  inventoryMovement: { create: jest.fn<AsyncMock>() },
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
        {
          provide: LowStockService,
          useValue: {
            levels: async () => new Map(),
            notifyCrossings: async () => 0,
          },
        },
        {
          provide: GeneralStockService,
          useValue: {
            consume: async () => undefined,
            increase: async () => undefined,
          },
        },
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
        {
          provide: LowStockService,
          useValue: {
            levels: async () => new Map(),
            notifyCrossings: async () => 0,
          },
        },
        {
          provide: GeneralStockService,
          useValue: {
            consume: async () => undefined,
            increase: async () => undefined,
          },
        },
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
        {
          provide: LowStockService,
          useValue: {
            levels: async () => new Map(),
            notifyCrossings: async () => 0,
          },
        },
        {
          provide: GeneralStockService,
          useValue: {
            consume: async () => undefined,
            increase: async () => undefined,
          },
        },
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

  describe("PurchasesService.receive", () => {
    let service: InstanceType<typeof PurchasesService>;
    const generalStockMock = { increase: jest.fn<AsyncMock>() };

    const purchaseWithReceivedQuantity = (
      status: string,
      receivedQuantity: number,
    ) => ({
      id: "purchase-1",
      purchaseNumber: "C-20261024-0001",
      status,
      supplierId: "supplier-1",
      purchaseAt: new Date("2026-10-24T10:00:00.000Z"),
      subtotal: 50,
      total: 50,
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
          requestedQuantity: 5,
          receivedQuantity,
          unitPrice: 10,
          subtotal: 50,
          received: receivedQuantity === 5,
          observation: null,
          product: { name: "Producto uno", referenceCode: "P-001" },
        },
      ],
    });

    beforeEach(async () => {
      jest.clearAllMocks();
      prismaMock.$transaction.mockImplementation((operation) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : operation(transactionMock),
      );
      transactionMock.purchaseDetail.update.mockResolvedValue({});
      transactionMock.purchaseDetail.findMany.mockResolvedValue([
        { receivedQuantity: 5, requestedQuantity: 5 },
      ]);
      transactionMock.purchase.update.mockResolvedValue({});
      transactionMock.inventoryMovement.create.mockResolvedValue({});
      auditMock.createAuditLog.mockResolvedValue({});
      generalStockMock.increase.mockResolvedValue(undefined);

      const module = await Test.createTestingModule({
        providers: [
          PurchasesService,
          { provide: PrismaService, useValue: prismaMock },
          { provide: AuditService, useValue: auditMock },
          { provide: GeneralStockService, useValue: generalStockMock },
        ],
      }).compile();
      service = module.get(PurchasesService);
    });

    it("records received stock as an ENTRY movement and completes the purchase", async () => {
      transactionMock.purchase.findUnique
        .mockResolvedValueOnce(
          purchaseWithReceivedQuantity("PENDING_RECEIPT", 0),
        )
        .mockResolvedValueOnce(
          purchaseWithReceivedQuantity("FULLY_RECEIVED", 5),
        );

      const result = await service.receive(
        "purchase-1",
        {
          items: [
            {
              purchaseDetailId: "detail-1",
              receivedQuantity: 5,
              expirationDate: "2027-06-30",
              observation: "Entrega completa",
            },
          ],
        },
        currentUser,
        "127.0.0.1",
      );

      expect(transactionMock.purchaseDetail.update).toHaveBeenCalledWith({
        where: { id: "detail-1" },
        data: {
          receivedQuantity: 5,
          received: true,
          observation: "Entrega completa",
        },
      });
      expect(generalStockMock.increase).toHaveBeenCalledWith(
        transactionMock,
        "product-1",
        new Date("2027-06-30T00:00:00.000Z"),
        5,
      );
      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId: "product-1",
          branchId: null,
          originBranchId: null,
          userId: currentUser.id,
          movementType: "ENTRY",
          quantity: 5,
          expirationDate: new Date("2027-06-30T00:00:00.000Z"),
          observation: "Entrega completa",
          purchaseId: "purchase-1",
        },
      });
      expect(transactionMock.purchase.update).toHaveBeenCalledWith({
        where: { id: "purchase-1" },
        data: { status: "FULLY_RECEIVED" },
      });
      expect(result).toMatchObject({
        id: "purchase-1",
        status: "FULLY_RECEIVED",
        items: [{ receivedQuantity: 5, received: true }],
      });
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RECEIVE",
          entity: "PURCHASE",
          entityId: "purchase-1",
          ipAddress: "127.0.0.1",
        }),
        transactionMock,
      );
    });

    it("marks a purchase as partially received and registers only the received quantity", async () => {
      transactionMock.purchase.findUnique
        .mockResolvedValueOnce(
          purchaseWithReceivedQuantity("PENDING_RECEIPT", 1),
        )
        .mockResolvedValueOnce(
          purchaseWithReceivedQuantity("PARTIALLY_RECEIVED", 3),
        );
      transactionMock.purchaseDetail.findMany.mockResolvedValue([
        { receivedQuantity: 3, requestedQuantity: 5 },
      ]);

      const result = await service.receive(
        "purchase-1",
        {
          items: [
            {
              purchaseDetailId: "detail-1",
              receivedQuantity: 2,
              expirationDate: "2027-06-30",
            },
          ],
        },
        currentUser,
      );

      expect(transactionMock.purchaseDetail.update).toHaveBeenCalledWith({
        where: { id: "detail-1" },
        data: { receivedQuantity: 3, received: false },
      });
      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: "ENTRY",
            quantity: 2,
            purchaseId: "purchase-1",
          }),
        }),
      );
      expect(transactionMock.purchase.update).toHaveBeenCalledWith({
        where: { id: "purchase-1" },
        data: { status: "PARTIALLY_RECEIVED" },
      });
      expect(result).toMatchObject({
        status: "PARTIALLY_RECEIVED",
        items: [{ receivedQuantity: 3, received: false }],
      });
    });

    it("throws PURCHASE_ALREADY_RECEIVED for a fully received purchase", async () => {
      transactionMock.purchase.findUnique.mockResolvedValue(
        purchaseWithReceivedQuantity("FULLY_RECEIVED", 5),
      );

      await expect(
        service.receive(
          "purchase-1",
          {
            items: [
              {
                purchaseDetailId: "detail-1",
                receivedQuantity: 1,
                expirationDate: "2027-06-30",
              },
            ],
          },
          currentUser,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "PURCHASE_ALREADY_RECEIVED" },
      });

      expect(transactionMock.purchaseDetail.update).not.toHaveBeenCalled();
      expect(transactionMock.inventoryMovement.create).not.toHaveBeenCalled();
    });

    it("throws PURCHASE_NOT_FOUND when the purchase does not exist", async () => {
      transactionMock.purchase.findUnique.mockResolvedValue(null);

      await expect(
        service.receive(
          "missing-purchase",
          {
            items: [
              {
                purchaseDetailId: "detail-1",
                receivedQuantity: 1,
                expirationDate: "2027-06-30",
              },
            ],
          },
          currentUser,
        ),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "PURCHASE_NOT_FOUND" },
      });

      expect(transactionMock.purchaseDetail.update).not.toHaveBeenCalled();
      expect(transactionMock.inventoryMovement.create).not.toHaveBeenCalled();
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
