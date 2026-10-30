import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NightlyJobsService } from "./nightly-jobs.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const centroId = "8f5c2d0e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";
const norteId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const now = new Date("2026-10-27T05:00:00.000Z");

const tx = {
  inventoryClosure: { updateMany: jest.fn<AsyncMock>() },
};

const prisma = {
  inventoryClosure: { findMany: jest.fn<AsyncMock>() },
  purchase: { findMany: jest.fn<AsyncMock>() },
  $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
    fn(tx),
  ),
};

const writer = {
  branchManagerIds: jest.fn<AsyncMock>(),
  superadminIds: jest.fn<AsyncMock>(),
  createForUsers: jest.fn<AsyncMock>(),
};

function closure(
  id: string,
  branchId: string,
  branch: string,
  counts: Array<number | null>,
) {
  return {
    id,
    branchId,
    closureDate: new Date("2026-10-26T00:00:00.000Z"),
    branch: { name: branch },
    details: counts.map((physicalQuantity) => ({ physicalQuantity })),
  };
}

describe("NightlyJobsService", () => {
  let service: NightlyJobsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NightlyJobsService(prisma as never, writer as never);
    prisma.inventoryClosure.findMany.mockResolvedValue([]);
    prisma.purchase.findMany.mockResolvedValue([]);
    tx.inventoryClosure.updateMany.mockResolvedValue({ count: 1 });
    writer.branchManagerIds.mockResolvedValue(["leader-id", "admin-id"]);
    writer.superadminIds.mockResolvedValue(["admin-id"]);
    writer.createForUsers.mockResolvedValue(1);
  });

  describe("lockPendingClosures", () => {
    it("only looks at pending closures started before the Bogota day", async () => {
      await service.lockPendingClosures(new Date("2026-10-27T05:10:00.000Z"));

      const [args] = prisma.inventoryClosure.findMany.mock.calls[0] as [
        { where: unknown },
      ];
      expect(args.where).toEqual({
        status: "PENDING",
        createdAt: { lt: new Date("2026-10-27T05:00:00.000Z") },
      });
    });

    it("does nothing when there are no pending closures", async () => {
      const locked = await service.lockPendingClosures(now);

      expect(locked).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.inventoryClosure.updateMany).not.toHaveBeenCalled();
      expect(writer.createForUsers).not.toHaveBeenCalled();
    });

    it("locks each closure as NOT_CONFIRMED and notifies the branch managers", async () => {
      prisma.inventoryClosure.findMany.mockResolvedValue([
        closure("c-1", centroId, "Centro", [10, null, 4]),
        closure("c-2", norteId, "Norte", [2]),
      ]);

      const locked = await service.lockPendingClosures(now);

      expect(locked).toBe(2);
      expect(tx.inventoryClosure.updateMany).toHaveBeenCalledWith({
        where: { id: "c-1", status: "PENDING" },
        data: {
          status: "NOT_CONFIRMED",
          confirmed: false,
          locked: true,
          closedAt: now,
        },
      });
      expect(writer.branchManagerIds).toHaveBeenCalledWith(tx, centroId);
      expect(writer.branchManagerIds).toHaveBeenCalledWith(tx, norteId);
      expect(writer.createForUsers).toHaveBeenCalledWith(
        tx,
        ["leader-id", "admin-id"],
        {
          type: "CLOSURE_NOT_CONFIRMED",
          title: "Cierre sin confirmar",
          message:
            "El cierre del 2026-10-26 en Centro no se confirmó y quedó bloqueado (2 de 3 conteos registrados).",
          branchId: centroId,
        },
      );
      expect(tx.inventoryClosure.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: "c-1", status: "PENDING" },
        data: {
          status: "NOT_CONFIRMED",
          confirmed: false,
          locked: true,
          closedAt: now,
        },
      });
      expect(writer.createForUsers).toHaveBeenCalledWith(
        tx,
        ["leader-id", "admin-id"],
        expect.objectContaining({
          message: expect.stringContaining("no se confirmó y quedó bloqueado"),
        }),
      );
    });

    it("skips a closure confirmed while the job was running", async () => {
      prisma.inventoryClosure.findMany.mockResolvedValue([
        closure("c-1", centroId, "Centro", [10]),
      ]);
      tx.inventoryClosure.updateMany.mockResolvedValue({ count: 0 });

      const locked = await service.lockPendingClosures(now);

      expect(locked).toBe(0);
      expect(writer.createForUsers).not.toHaveBeenCalled();
    });
  });

  describe("remindPendingPurchases", () => {
    it("looks for unreceived purchases made between 8 and 7 days ago", async () => {
      await service.remindPendingPurchases(now);

      const [args] = prisma.purchase.findMany.mock.calls[0] as [
        { where: unknown },
      ];
      expect(args.where).toEqual({
        status: { in: ["PENDING_RECEIPT", "PARTIALLY_RECEIVED"] },
        purchaseAt: {
          gte: new Date("2026-10-19T05:00:00.000Z"),
          lt: new Date("2026-10-20T05:00:00.000Z"),
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("notifies the superadmins once per purchase with the supplier name", async () => {
      prisma.purchase.findMany.mockResolvedValue([
        {
          id: "p-1",
          purchaseNumber: "COMP-0001",
          status: "PENDING_RECEIPT",
          supplier: {
            commercialName: "NutriMax",
            person: {
              businessName: "NutriMax SAS",
              firstName: null,
              lastName: null,
            },
          },
        },
        {
          id: "p-2",
          purchaseNumber: "COMP-0002",
          status: "PARTIALLY_RECEIVED",
          supplier: {
            commercialName: null,
            person: { businessName: null, firstName: "Ana", lastName: "Gómez" },
          },
        },
      ]);

      const reminded = await service.remindPendingPurchases(now);

      expect(reminded).toBe(2);
      expect(writer.createForUsers).toHaveBeenNthCalledWith(
        1,
        tx,
        ["admin-id"],
        {
          type: "PURCHASE_PENDING_RECEIPT",
          title: "Compra pendiente de recepción",
          message:
            "La compra COMP-0001 a NutriMax sigue sin recibirse después de 7 días.",
        },
      );
      expect(writer.createForUsers).toHaveBeenNthCalledWith(
        2,
        tx,
        ["admin-id"],
        {
          type: "PURCHASE_PENDING_RECEIPT",
          title: "Compra pendiente de recepción",
          message:
            "La compra COMP-0002 a Ana Gómez sigue recibida solo en parte después de 7 días.",
        },
      );
    });

    it("reports zero reminders when there is no active superadmin", async () => {
      prisma.purchase.findMany.mockResolvedValue([
        {
          id: "p-1",
          purchaseNumber: "COMP-0001",
          status: "PENDING_RECEIPT",
          supplier: {
            commercialName: "NutriMax",
            person: { businessName: null, firstName: null, lastName: null },
          },
        },
      ]);
      writer.superadminIds.mockResolvedValue([]);
      writer.createForUsers.mockResolvedValue(0);

      expect(await service.remindPendingPurchases(now)).toBe(0);
    });
  });

  it("run executes both jobs with the same instant", async () => {
    const lock = jest
      .spyOn(service, "lockPendingClosures")
      .mockResolvedValue(3);
    const remind = jest
      .spyOn(service, "remindPendingPurchases")
      .mockResolvedValue(1);

    expect(await service.run(now)).toEqual({
      lockedClosures: 3,
      purchaseReminders: 1,
    });
    expect(lock).toHaveBeenCalledWith(now);
    expect(remind).toHaveBeenCalledWith(now);
  });

  it("handleCron logs a failure instead of throwing", async () => {
    jest.spyOn(service, "run").mockRejectedValue(new Error("db down"));
    const logger = (service as unknown as { logger: { error: () => void } })
      .logger;
    const error = jest.spyOn(logger, "error").mockImplementation(() => {});

    await expect(service.handleCron()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
