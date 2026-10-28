import "reflect-metadata";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { ROLES_KEY } from "../../common/decorators/roles.decorator.js";
import { GeneralStockController } from "./general-stock.controller.js";
import { GeneralStockService } from "./general-stock.service.js";
import { RestockMovementType } from "./dto/restock-general-stock.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const productId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const expirationDate = new Date("2027-01-20T00:00:00.000Z");

const tx = {
  $queryRaw: jest.fn<AsyncMock>(),
  product: { findUnique: jest.fn<AsyncMock>() },
  generalStock: {
    findUnique: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
    upsert: jest.fn<AsyncMock>(),
  },
  inventoryMovement: { create: jest.fn<AsyncMock>() },
};

const prisma = {
  product: { findUnique: jest.fn<AsyncMock>() },
  $transaction:
    jest.fn<
      (operation: (client: typeof tx) => Promise<unknown>) => Promise<unknown>
    >(),
};

const audit = { createAuditLog: jest.fn<AsyncMock>() };
const currentUser: AuthenticatedUser = {
  id: "superadmin-1",
  active: true,
  role: { name: "SUPERADMIN" },
};

describe("GeneralStockService", () => {
  let service: GeneralStockService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-25T15:00:00.000Z") });
    jest.resetAllMocks();
    service = new GeneralStockService(prisma as never, audit as never);
    prisma.$transaction.mockImplementation((operation) => operation(tx));
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

  describe("restock", () => {
    const activeProduct = {
      id: productId,
      name: "Whey Protein 2 lb",
      referenceCode: "WHEY-2LB-001",
      active: true,
      unitOfMeasure: { abreviation: "und" },
    };

    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([]);
      tx.product.findUnique.mockResolvedValue(activeProduct);
      tx.generalStock.findMany
        .mockResolvedValueOnce([{ id: "lot-1", quantity: 12, expirationDate }])
        .mockResolvedValueOnce([{ id: "lot-1", quantity: 19, expirationDate }]);
      tx.generalStock.update.mockResolvedValue({});
      tx.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
      audit.createAuditLog.mockResolvedValue({});
    });

    it("increases an existing lot and records the restock movement", async () => {
      const result = await service.restock(
        productId,
        {
          quantity: 7,
          movementType: RestockMovementType.ADJUSTMENT_ENTRY,
          reason: "Inventory recount adjustment",
        },
        currentUser,
        "127.0.0.1",
      );

      expect(tx.product.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: productId } }),
      );
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.generalStock.update).toHaveBeenCalledWith({
        where: { id: "lot-1" },
        data: { quantity: { increment: 7 } },
      });
      expect(tx.inventoryMovement.create).toHaveBeenCalledWith({
        data: {
          productId,
          branchId: null,
          originBranchId: null,
          userId: currentUser.id,
          movementType: "ADJUSTMENT_ENTRY",
          quantity: 7,
          expirationDate,
          observation: "Inventory recount adjustment",
        },
        select: { id: true },
      });
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RESTOCK",
          entity: "INVENTORY_MOVEMENT",
          entityId: "movement-1",
          newData: expect.objectContaining({
            previousQuantity: 12,
            resultingQuantity: 19,
          }),
          ipAddress: "127.0.0.1",
        }),
        tx,
      );
      expect(result).toMatchObject({
        product: {
          id: productId,
          name: "Whey Protein 2 lb",
          referenceCode: "WHEY-2LB-001",
          unitOfMeasure: { abbreviation: "und" },
        },
        totalQuantity: 19,
        lots: [
          {
            id: "lot-1",
            expirationDate: "2027-01-20",
            quantity: 19,
            expired: false,
          },
        ],
      });
    });

    it("throws PRODUCT_NOT_FOUND when the requested product does not exist", async () => {
      tx.product.findUnique.mockResolvedValue(null);

      await expect(
        service.restock(
          productId,
          {
            quantity: 7,
            movementType: RestockMovementType.ADJUSTMENT_ENTRY,
            reason: "Inventory recount adjustment",
          },
          currentUser,
        ),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "PRODUCT_NOT_FOUND" },
      });

      expect(tx.generalStock.findMany).not.toHaveBeenCalled();
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });

    it.each([0, -1])(
      "rejects quantity %i before starting a transaction",
      async (quantity) => {
        await expect(
          service.restock(
            productId,
            {
              quantity,
              movementType: RestockMovementType.ADJUSTMENT_ENTRY,
              reason: "Inventory recount adjustment",
            },
            currentUser,
          ),
        ).rejects.toMatchObject({
          status: 400,
          response: { code: "INVALID_QUANTITY" },
        });

        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );
  });
});

describe("POST /general-stock/:productId/restock role guard", () => {
  const guard = new RolesGuard(new Reflector());
  const restockMethod: unknown = Object.getOwnPropertyDescriptor(
    GeneralStockController.prototype,
    "restock",
  )?.value;

  if (typeof restockMethod !== "function") {
    throw new Error("GeneralStockController.restock handler is missing");
  }

  const rolesMetadata: unknown = Reflect.getMetadata(ROLES_KEY, restockMethod);
  if (
    !Array.isArray(rolesMetadata) ||
    rolesMetadata.some((role: unknown) => typeof role !== "string")
  ) {
    throw new Error("GeneralStockController.restock roles are missing");
  }
  const requiredRoles = rolesMetadata as string[];
  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_KEY, requiredRoles, handler);

  const contextFor = (roleName: string): ExecutionContext => {
    const user: AuthenticatedUser = {
      id: "test-user",
      active: true,
      role: { name: roleName },
    };
    return {
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
      getClass: () => GeneralStockController,
      getHandler: () => handler,
    } as ExecutionContext;
  };

  it("allows SUPERADMIN to restock", () => {
    expect(guard.canActivate(contextFor("SUPERADMIN"))).toBe(true);
    expect(requiredRoles).toEqual(["SUPERADMIN"]);
  });

  it("denies users without the SUPERADMIN role", () => {
    expect(() => guard.canActivate(contextFor("BRANCH_LEADER"))).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: "INSUFFICIENT_PERMISSIONS",
        }),
      }),
    );
  });
});
