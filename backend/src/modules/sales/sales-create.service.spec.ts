import "reflect-metadata";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { TestingModule } from "@nestjs/testing";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const lowStockMock = {
  levels: async () => new Map(),
  notifyCrossings: async () => 0,
};

const branchId = "11111111-1111-4111-8111-111111111111";
const otherBranchId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const productAId = "44444444-4444-4444-8444-444444444444";
const productBId = "55555555-5555-4555-8555-555555555555";
const cashMethodId = "66666666-6666-4666-8666-666666666666";
const cardMethodId = "77777777-7777-4777-8777-777777777777";
const customerId = "88888888-8888-4888-8888-888888888888";
const saleId = "99999999-9999-4999-8999-999999999999";
const firstLotId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondLotId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productBLotId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const saleDate = new Date("2026-10-26T15:30:00.000Z");

const productA = {
  id: productAId,
  name: "Proteína",
  referenceCode: "P-001",
  price: "12.35",
  active: true,
};

const productB = {
  id: productBId,
  name: "Creatina",
  referenceCode: "P-002",
  price: "0.10",
  active: true,
};

const cashMethod = {
  id: cashMethodId,
  code: "CASH",
  name: "Efectivo",
  active: true,
};

const cardMethod = {
  id: cardMethodId,
  code: "CARD",
  name: "Tarjeta",
  active: true,
};

const transactionMock = {
  $queryRaw: jest.fn<AsyncMock>(),
  branch: { findUnique: jest.fn<AsyncMock>() },
  customer: { findUnique: jest.fn<AsyncMock>() },
  product: { findMany: jest.fn<AsyncMock>() },
  paymentMethod: { findMany: jest.fn<AsyncMock>() },
  inventoryClosure: { findUnique: jest.fn<AsyncMock>() },
  branchInventory: {
    findMany: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  inventoryMovement: { create: jest.fn<AsyncMock>() },
  sale: {
    findFirst: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
};

const prismaMock = {
  $transaction:
    jest.fn<
      (
        callback: (client: typeof transactionMock) => Promise<unknown>,
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
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { LowStockService } =
  await import("../notifications/low-stock.service.js");
const { SalesService } = await import("./sales.service.js");

type SaleCreateData = {
  saleNumber: string;
  branchId: string;
  userId: string;
  customerId: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  status: string;
  details: { create: Array<Record<string, unknown>> };
  payments: { create: Array<Record<string, unknown>> };
};

const superadmin: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const userWithRole = (
  roleName: string,
  assignedBranchIds: string[] = [],
): AuthenticatedUser => ({
  id: userId,
  active: true,
  role: { name: roleName },
  branches: assignedBranchIds.map((id) => ({ id, name: "Sede Centro" })),
});

const buildSaleRecord = (overrides: Record<string, unknown> = {}) => ({
  id: saleId,
  saleNumber: "V-20261026-0001",
  status: "COMPLETED",
  saleAt: saleDate,
  subtotal: "24.70",
  discountAmount: "0.00",
  taxAmount: "0.00",
  total: "24.70",
  reversalReason: null,
  reversedAt: null,
  branch: { id: branchId, name: "Sede Centro" },
  user: {
    personId: userId,
    person: { firstName: "Fabian", lastName: "Correa" },
  },
  customer: null,
  details: [
    {
      productId: productAId,
      quantity: 2,
      unitPrice: "12.35",
      subtotal: "24.70",
      discountAmount: "0.00",
      taxAmount: "0.00",
      total: "24.70",
      product: { name: "Proteína", referenceCode: "P-001" },
    },
  ],
  payments: [
    {
      amount: "24.70",
      reference: null,
      paidAt: saleDate,
      paymentMethod: { id: cashMethodId, code: "CASH", name: "Efectivo" },
    },
  ],
  ...overrides,
});

const baseDto = {
  branchId,
  items: [{ productId: productAId, quantity: 2 }],
  payments: [{ paymentMethodId: cashMethodId, amount: "24.70" }],
};

const createdSaleData = (): SaleCreateData => {
  const [args] = transactionMock.sale.create.mock.calls[0] as unknown as Array<{
    data: SaleCreateData;
  }>;
  return args.data;
};

const rawQueryText = (): string => {
  const [strings] = transactionMock.$queryRaw.mock.calls[0] as unknown as [
    string[],
  ];
  return strings.join("?");
};

describe("SalesService.create", () => {
  let service: InstanceType<typeof SalesService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.useFakeTimers({ now: saleDate });
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((callback) =>
      callback(transactionMock),
    );

    transactionMock.$queryRaw.mockResolvedValue([]);
    transactionMock.branch.findUnique.mockResolvedValue({
      id: branchId,
      name: "Sede Centro",
      active: true,
    });
    transactionMock.customer.findUnique.mockResolvedValue({
      personId: customerId,
      active: true,
    });
    transactionMock.product.findMany.mockResolvedValue([productA, productB]);
    transactionMock.paymentMethod.findMany.mockResolvedValue([
      cashMethod,
      cardMethod,
    ]);
    transactionMock.inventoryClosure.findUnique.mockResolvedValue(null);
    transactionMock.branchInventory.findMany.mockResolvedValue([
      { id: firstLotId, quantity: 10, minimumStock: 2 },
    ]);
    transactionMock.branchInventory.update.mockResolvedValue({});
    transactionMock.inventoryMovement.create.mockResolvedValue({});
    transactionMock.sale.findFirst.mockResolvedValue(null);
    transactionMock.sale.create.mockResolvedValue(buildSaleRecord());
    auditMock.createAuditLog.mockResolvedValue({});

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
    jest.useRealTimers();
  });

  describe("branch scope", () => {
    it("allows a superadmin without assigned branches", async () => {
      await expect(service.create(baseDto, superadmin)).resolves.toBeDefined();
    });

    it("allows a branch leader assigned to the sale branch", async () => {
      const leader = userWithRole("BRANCH_LEADER", [branchId]);

      await expect(service.create(baseDto, leader)).resolves.toBeDefined();
    });

    it("allows a branch assistant assigned to the sale branch", async () => {
      const assistant = userWithRole("BRANCH_ASSISTANT", [branchId]);

      await expect(service.create(baseDto, assistant)).resolves.toBeDefined();
    });

    it.each(["BRANCH_LEADER", "BRANCH_ASSISTANT"])(
      "rejects a %s assigned to another branch",
      async (roleName) => {
        const user = userWithRole(roleName, [otherBranchId]);

        await expect(service.create(baseDto, user)).rejects.toMatchObject({
          status: 403,
          response: { code: "BRANCH_SCOPE_VIOLATION" },
        });

        expect(prismaMock.$transaction).not.toHaveBeenCalled();
      },
    );

    it("rejects a role that cannot register sales", async () => {
      const dev = userWithRole("DEV", [branchId]);

      await expect(service.create(baseDto, dev)).rejects.toMatchObject({
        status: 403,
        response: { code: "FORBIDDEN" },
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("duplicated products", () => {
    it("rejects two items with the same product before opening the transaction", async () => {
      const dto = {
        ...baseDto,
        items: [
          { productId: productAId, quantity: 1 },
          { productId: productAId, quantity: 2 },
        ],
        payments: [{ paymentMethodId: cashMethodId, amount: "37.05" }],
      };

      await expect(service.create(dto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: { code: "DUPLICATED_PRODUCT" },
      });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("branch validation", () => {
    it("rejects when the branch does not exist", async () => {
      transactionMock.branch.findUnique.mockResolvedValue(null);

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 404,
        response: { code: "BRANCH_NOT_FOUND" },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("rejects an inactive branch", async () => {
      transactionMock.branch.findUnique.mockResolvedValue({
        id: branchId,
        name: "Sede Centro",
        active: false,
      });

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: { code: "BRANCH_INACTIVE" },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });
  });

  describe("inventory closure", () => {
    it("rejects the sale when the day is confirmed", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        status: "CONFIRMED",
        locked: false,
      });

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: { code: "INVENTORY_CLOSED" },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("rejects the sale when the day is locked", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        status: "PENDING",
        locked: true,
      });

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: { code: "INVENTORY_CLOSED" },
      });
    });

    it("allows the sale when the day is pending and unlocked", async () => {
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        status: "PENDING",
        locked: false,
      });

      await expect(service.create(baseDto, superadmin)).resolves.toBeDefined();
    });

    it("looks up the closure with the date normalized to UTC midnight", async () => {
      await service.create(baseDto, superadmin);

      expect(transactionMock.inventoryClosure.findUnique).toHaveBeenCalledWith({
        where: {
          branchId_closureDate: {
            branchId,
            closureDate: new Date("2026-10-26T00:00:00.000Z"),
          },
        },
        select: { status: true, locked: true },
      });
    });
  });

  describe("customer validation", () => {
    it("rejects when the customer does not exist", async () => {
      transactionMock.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...baseDto, customerId }, superadmin),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "CUSTOMER_NOT_FOUND" },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("rejects an inactive customer", async () => {
      transactionMock.customer.findUnique.mockResolvedValue({
        personId: customerId,
        active: false,
      });

      await expect(
        service.create({ ...baseDto, customerId }, superadmin),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: "CUSTOMER_INACTIVE" },
      });
    });

    it("skips the customer lookup when the sale has no customer", async () => {
      await service.create(baseDto, superadmin);

      expect(transactionMock.customer.findUnique).not.toHaveBeenCalled();
      expect(createdSaleData().customerId).toBeNull();
    });
  });

  describe("product validation", () => {
    it("rejects a product that does not exist", async () => {
      transactionMock.product.findMany.mockResolvedValue([]);

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 404,
        response: {
          code: "PRODUCT_NOT_FOUND",
          message: `Product ${productAId} not found.`,
        },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("rejects an inactive product", async () => {
      transactionMock.product.findMany.mockResolvedValue([
        { ...productA, active: false },
      ]);

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "PRODUCT_INACTIVE",
          message: 'Product "Proteína" is inactive.',
        },
      });
    });
  });

  describe("payment method validation", () => {
    it("rejects a payment method that does not exist", async () => {
      transactionMock.paymentMethod.findMany.mockResolvedValue([]);

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 404,
        response: {
          code: "PAYMENT_METHOD_NOT_FOUND",
          message: `Payment method ${cashMethodId} not found.`,
        },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("rejects an inactive payment method", async () => {
      transactionMock.paymentMethod.findMany.mockResolvedValue([
        { ...cashMethod, active: false },
      ]);

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "PAYMENT_METHOD_INACTIVE",
          message: 'Payment method "Efectivo" is inactive.',
        },
      });
    });
  });

  describe("money calculation", () => {
    it("calculates the subtotal from the catalog price and the quantity", async () => {
      const dto = {
        ...baseDto,
        items: [{ productId: productAId, quantity: 3 }],
        payments: [{ paymentMethodId: cashMethodId, amount: "37.05" }],
      };

      await service.create(dto, superadmin);

      expect(transactionMock.product.findMany).toHaveBeenCalledWith({
        where: { id: { in: [productAId] } },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          price: true,
          active: true,
        },
      });

      const [detail] = createdSaleData().details.create;
      expect(detail).toMatchObject({
        productId: productAId,
        quantity: 3,
        unitPrice: "12.35",
        subtotal: "37.05",
        total: "37.05",
      });
    });

    it("sums the item discounts and the general discount", async () => {
      const dto = {
        ...baseDto,
        items: [{ productId: productAId, quantity: 2, discountAmount: "2.00" }],
        discountAmount: "1.50",
        payments: [{ paymentMethodId: cashMethodId, amount: "21.20" }],
      };

      await service.create(dto, superadmin);

      expect(createdSaleData()).toMatchObject({
        subtotal: "24.70",
        discountAmount: "3.50",
        total: "21.20",
      });
    });

    it("sums the item taxes and the general tax", async () => {
      const dto = {
        ...baseDto,
        items: [{ productId: productAId, quantity: 2, taxAmount: "1.00" }],
        taxAmount: "0.50",
        payments: [{ paymentMethodId: cashMethodId, amount: "26.20" }],
      };

      await service.create(dto, superadmin);

      expect(createdSaleData()).toMatchObject({
        subtotal: "24.70",
        taxAmount: "1.50",
        total: "26.20",
      });
    });

    it("computes the total as subtotal minus discounts plus taxes", async () => {
      const dto = {
        ...baseDto,
        items: [
          {
            productId: productAId,
            quantity: 2,
            discountAmount: "2.00",
            taxAmount: "1.00",
          },
        ],
        payments: [{ paymentMethodId: cashMethodId, amount: "23.70" }],
      };

      await service.create(dto, superadmin);

      expect(createdSaleData()).toMatchObject({
        subtotal: "24.70",
        discountAmount: "2.00",
        taxAmount: "1.00",
        total: "23.70",
      });
    });

    it("persists the money values as two-decimal strings", async () => {
      await service.create(baseDto, superadmin);

      const data = createdSaleData();
      expect(data.subtotal).toBe("24.70");
      expect(data.discountAmount).toBe("0.00");
      expect(data.taxAmount).toBe("0.00");
      expect(data.total).toBe("24.70");
    });
  });

  describe("discount limits", () => {
    it("rejects an item discount greater than its subtotal", async () => {
      const dto = {
        ...baseDto,
        items: [
          { productId: productAId, quantity: 2, discountAmount: "30.00" },
        ],
        payments: [{ paymentMethodId: cashMethodId, amount: "1.00" }],
      };

      await expect(service.create(dto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "DISCOUNT_EXCEEDS_SUBTOTAL",
          details: {
            productId: productAId,
            subtotal: "24.70",
            discountAmount: "30.00",
          },
        },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("rejects a general discount that leaves a negative total", async () => {
      const dto = {
        ...baseDto,
        discountAmount: "30.00",
        payments: [{ paymentMethodId: cashMethodId, amount: "1.00" }],
      };

      await expect(service.create(dto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "DISCOUNT_EXCEEDS_SUBTOTAL",
          details: { subtotal: "24.70", discountAmount: "30.00" },
        },
      });
    });
  });

  describe("payments", () => {
    it("rejects a payment with an amount of zero", async () => {
      const dto = {
        ...baseDto,
        payments: [{ paymentMethodId: cashMethodId, amount: "0.00" }],
      };

      await expect(service.create(dto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "PAYMENT_AMOUNT_INVALID",
          details: { index: 0 },
        },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("rejects when the payments do not match the total", async () => {
      const dto = {
        ...baseDto,
        payments: [{ paymentMethodId: cashMethodId, amount: "20.00" }],
      };

      await expect(service.create(dto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "PAYMENT_TOTAL_MISMATCH",
          details: { expected: "24.70", received: "20.00" },
        },
      });
    });

    it("accepts a sale paid with two methods", async () => {
      const dto = {
        ...baseDto,
        payments: [
          { paymentMethodId: cashMethodId, amount: "20.00" },
          {
            paymentMethodId: cardMethodId,
            amount: "4.70",
            reference: "TRX-1",
          },
        ],
      };

      await service.create(dto, superadmin);

      expect(createdSaleData().payments.create).toEqual([
        {
          paymentMethodId: cashMethodId,
          amount: "20.00",
          reference: null,
        },
        {
          paymentMethodId: cardMethodId,
          amount: "4.70",
          reference: "TRX-1",
        },
      ]);
    });
  });

  describe("stock", () => {
    it("rejects a sale when an item does not have enough stock", async () => {
      transactionMock.branchInventory.findMany.mockResolvedValue([
        { id: firstLotId, quantity: 1, minimumStock: 2 },
      ]);

      await expect(service.create(baseDto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "INSUFFICIENT_STOCK",
          details: {
            items: [
              {
                productId: productAId,
                productName: "Proteína",
                requested: 2,
                available: 1,
              },
            ],
          },
        },
      });

      expect(transactionMock.sale.create).not.toHaveBeenCalled();
    });

    it("reports every item without enough stock", async () => {
      transactionMock.branchInventory.findMany.mockImplementation((args) => {
        const { productId } = (args as { where: { productId: string } }).where;

        return Promise.resolve(
          productId === productAId
            ? [{ id: firstLotId, quantity: 1, minimumStock: 0 }]
            : [{ id: productBLotId, quantity: 1, minimumStock: 0 }],
        );
      });

      const dto = {
        ...baseDto,
        items: [
          { productId: productAId, quantity: 2 },
          { productId: productBId, quantity: 5 },
        ],
        payments: [{ paymentMethodId: cashMethodId, amount: "25.20" }],
      };

      await expect(service.create(dto, superadmin)).rejects.toMatchObject({
        status: 422,
        response: {
          code: "INSUFFICIENT_STOCK",
          details: {
            items: [
              {
                productId: productAId,
                requested: 2,
                available: 1,
              },
              {
                productId: productBId,
                requested: 5,
                available: 1,
              },
            ],
          },
        },
      });
    });

    it("locks the branch inventory rows of every product", async () => {
      await service.create(baseDto, superadmin);

      expect(transactionMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(rawQueryText()).toContain("FOR UPDATE");
      expect(transactionMock.$queryRaw).toHaveBeenCalledWith(
        expect.anything(),
        branchId,
        productAId,
      );
    });
  });

  describe("stock effects", () => {
    it("takes the stock from the non-expired lot that expires first", async () => {
      transactionMock.branchInventory.findMany.mockResolvedValue([
        { id: firstLotId, quantity: 1, minimumStock: 0 },
        { id: secondLotId, quantity: 5, minimumStock: 0 },
      ]);

      const dto = {
        ...baseDto,
        items: [{ productId: productAId, quantity: 3 }],
        payments: [{ paymentMethodId: cashMethodId, amount: "37.05" }],
      };

      await service.create(dto, superadmin);

      expect(transactionMock.branchInventory.findMany).toHaveBeenCalledWith({
        where: {
          branchId,
          productId: productAId,
          expirationDate: { gte: expect.any(Date) },
        },
        select: {
          id: true,
          quantity: true,
          minimumStock: true,
          expirationDate: true,
        },
        orderBy: { expirationDate: "asc" },
      });
      expect(transactionMock.branchInventory.update).toHaveBeenCalledTimes(2);
      expect(transactionMock.branchInventory.update).toHaveBeenNthCalledWith(
        1,
        {
          where: { id: firstLotId },
          data: { quantity: { decrement: 1 } },
        },
      );
      expect(transactionMock.branchInventory.update).toHaveBeenNthCalledWith(
        2,
        {
          where: { id: secondLotId },
          data: { quantity: { decrement: 2 } },
        },
      );
    });

    it("registers one exit movement per item", async () => {
      const dto = {
        ...baseDto,
        items: [
          { productId: productAId, quantity: 1 },
          { productId: productBId, quantity: 2 },
        ],
        payments: [{ paymentMethodId: cashMethodId, amount: "12.55" }],
      };

      await service.create(dto, superadmin);

      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledTimes(2);
      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId: productAId,
          branchId,
          originBranchId: null,
          userId,
          movementType: "EXIT",
          quantity: 1,
          saleId,
        },
      });
      expect(transactionMock.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId: productBId,
          branchId,
          originBranchId: null,
          userId,
          movementType: "EXIT",
          quantity: 2,
          saleId,
        },
      });
    });

    it("numbers the first sale of the day", async () => {
      await service.create(baseDto, superadmin);

      expect(createdSaleData().saleNumber).toBe("V-20261026-0001");
      expect(transactionMock.sale.findFirst).toHaveBeenCalledWith({
        where: {
          branchId,
          saleNumber: { startsWith: "V-20261026-" },
        },
        orderBy: { saleNumber: "desc" },
        select: { saleNumber: true },
      });
    });

    it("increments the sequence of the last sale of the day", async () => {
      transactionMock.sale.findFirst.mockResolvedValue({
        saleNumber: "V-20261026-0007",
      });

      await service.create(baseDto, superadmin);

      expect(createdSaleData().saleNumber).toBe("V-20261026-0008");
    });

    it("stores the sale as completed for the current user", async () => {
      await service.create(baseDto, superadmin);

      expect(createdSaleData()).toMatchObject({
        branchId,
        userId,
        status: "COMPLETED",
      });
    });
  });

  describe("response", () => {
    it("maps the created sale into the response", async () => {
      transactionMock.sale.create.mockResolvedValue(
        buildSaleRecord({
          saleNumber: "V-20261026-0003",
          discountAmount: "2.00",
          taxAmount: "1.00",
          total: "23.70",
          customer: { personId: customerId, fullName: "Cliente Prueba" },
          details: [
            {
              productId: productAId,
              quantity: 2,
              unitPrice: "12.35",
              subtotal: "24.70",
              discountAmount: "2.00",
              taxAmount: "1.00",
              total: "23.70",
              product: { name: "Proteína", referenceCode: "P-001" },
            },
          ],
          payments: [
            {
              amount: "20.00",
              reference: null,
              paidAt: saleDate,
              paymentMethod: {
                id: cashMethodId,
                code: "CASH",
                name: "Efectivo",
              },
            },
            {
              amount: "3.70",
              reference: "TRX-1",
              paidAt: saleDate,
              paymentMethod: {
                id: cardMethodId,
                code: "CARD",
                name: "Tarjeta",
              },
            },
          ],
        }),
      );

      const result = await service.create(baseDto, superadmin);

      expect(result).toEqual({
        id: saleId,
        saleNumber: "V-20261026-0003",
        status: "COMPLETED",
        branch: { id: branchId, name: "Sede Centro" },
        user: { id: userId, fullName: "Fabian Correa" },
        customer: { id: customerId, fullName: "Cliente Prueba" },
        saleAt: saleDate,
        subtotal: "24.70",
        discountAmount: "2.00",
        taxAmount: "1.00",
        total: "23.70",
        items: [
          {
            productId: productAId,
            productName: "Proteína",
            referenceCode: "P-001",
            quantity: 2,
            unitPrice: "12.35",
            subtotal: "24.70",
            discountAmount: "2.00",
            taxAmount: "1.00",
            total: "23.70",
          },
        ],
        payments: [
          {
            paymentMethod: {
              id: cashMethodId,
              code: "CASH",
              name: "Efectivo",
            },
            amount: "20.00",
            reference: null,
            paidAt: saleDate,
          },
          {
            paymentMethod: {
              id: cardMethodId,
              code: "CARD",
              name: "Tarjeta",
            },
            amount: "3.70",
            reference: "TRX-1",
            paidAt: saleDate,
          },
        ],
        reversalReason: null,
        reversedAt: null,
      });
    });

    it("returns a null customer when the sale has none", async () => {
      const result = await service.create(baseDto, superadmin);

      expect(result.customer).toBeNull();
    });
  });

  describe("failures", () => {
    it("propagates a failure while creating the sale without touching the stock", async () => {
      const error = new Error("sale insert failed");
      transactionMock.sale.create.mockRejectedValue(error);

      await expect(service.create(baseDto, superadmin)).rejects.toBe(error);

      expect(transactionMock.branchInventory.update).not.toHaveBeenCalled();
      expect(transactionMock.inventoryMovement.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("does not write an audit log for a new sale", async () => {
      await service.create(baseDto, superadmin);

      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });
  });
});
