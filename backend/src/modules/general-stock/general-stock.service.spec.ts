import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import { GeneralStockService } from "./general-stock.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const productId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const expirationDate = new Date("2027-01-20T00:00:00.000Z");

const tx = {
  $queryRaw: jest.fn<AsyncMock>(),
  generalStock: {
    findUnique: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
    upsert: jest.fn<AsyncMock>(),
  },
};

const prisma = { product: { findUnique: jest.fn<AsyncMock>() } };

describe("GeneralStockService", () => {
  let service: GeneralStockService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-25T15:00:00.000Z") });
    jest.resetAllMocks();
    service = new GeneralStockService(prisma as never, {} as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("adds the received units to the lot of that expiration date", async () => {
    await service.increase(tx as never, productId, expirationDate, 48);

    expect(tx.generalStock.upsert).toHaveBeenCalledWith({
      where: { productId_expirationDate: { productId, expirationDate } },
      create: { productId, expirationDate, quantity: 48 },
      update: { quantity: { increment: 48 } },
    });
  });

  it("takes units from the lot after locking it", async () => {
    tx.generalStock.findUnique.mockResolvedValue({ id: "lot-1", quantity: 30 });

    await service.consume(tx as never, productId, expirationDate, 20);

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.generalStock.update).toHaveBeenCalledWith({
      where: { id: "lot-1" },
      data: { quantity: { decrement: 20 } },
    });
  });

  it("rejects taking more than the lot has", async () => {
    tx.generalStock.findUnique.mockResolvedValue({ id: "lot-1", quantity: 3 });

    await expect(
      service.consume(tx as never, productId, expirationDate, 5),
    ).rejects.toMatchObject({
      response: {
        code: "INSUFFICIENT_GENERAL_STOCK",
        details: { expirationDate: "2027-01-20", requested: 5, available: 3 },
      },
    });
    expect(tx.generalStock.update).not.toHaveBeenCalled();
  });

  it("rejects a lot that does not exist in the general stock", async () => {
    tx.generalStock.findUnique.mockResolvedValue(null);

    await expect(
      service.consume(tx as never, productId, expirationDate, 1),
    ).rejects.toMatchObject({
      response: {
        code: "INSUFFICIENT_GENERAL_STOCK",
        details: { available: 0 },
      },
    });
  });

  it("lists the lots of a product with stock, flagging the expired ones", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: productId,
      name: "Whey Protein 2 lb",
      referenceCode: "WHEY-2LB-001",
      active: true,
      unitOfMeasure: { abreviation: "und" },
      generalStock: [
        {
          id: "old",
          quantity: 4,
          expirationDate: new Date("2026-10-01T00:00:00.000Z"),
        },
        { id: "new", quantity: 30, expirationDate },
      ],
    });

    await expect(service.findByProduct(productId)).resolves.toEqual({
      product: {
        id: productId,
        name: "Whey Protein 2 lb",
        referenceCode: "WHEY-2LB-001",
        active: true,
        unitOfMeasure: { abbreviation: "und" },
      },
      totalQuantity: 34,
      lots: [
        { id: "old", expirationDate: "2026-10-01", quantity: 4, expired: true },
        {
          id: "new",
          expirationDate: "2027-01-20",
          quantity: 30,
          expired: false,
        },
      ],
    });
  });

  it("returns 404 for an unknown product", async () => {
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(service.findByProduct(productId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
