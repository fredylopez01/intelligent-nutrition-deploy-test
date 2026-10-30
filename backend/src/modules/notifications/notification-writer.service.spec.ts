import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotificationWriterService } from "./notification-writer.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "8f5c2d0e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";

const tx = {
  userAccount: { findMany: jest.fn<AsyncMock>() },
  notification: { createMany: jest.fn<AsyncMock>() },
};

describe("NotificationWriterService", () => {
  const service = new NotificationWriterService();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("finds the active superadmins and the active leaders assigned to the branch", async () => {
    tx.userAccount.findMany.mockResolvedValue([
      { personId: "leader" },
      { personId: "admin" },
    ]);

    await expect(
      service.branchManagerIds(tx as never, branchId),
    ).resolves.toEqual(["leader", "admin"]);
    expect(tx.userAccount.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        person: { active: true },
        OR: [
          { role: { name: "SUPERADMIN" } },
          {
            role: { name: "BRANCH_LEADER" },
            branchAssignments: { some: { branchId, active: true } },
          },
        ],
      },
      select: { personId: true },
    });
  });

  it("creates one notification per recipient", async () => {
    tx.notification.createMany.mockResolvedValue({ count: 2 });

    const created = await service.createForUsers(
      tx as never,
      ["leader", "admin"],
      {
        type: "CLOSURE_NOT_CONFIRMED",
        title: "Cierre no confirmado",
        message: "El cierre de Centro quedó bloqueado.",
        branchId,
      },
    );

    expect(created).toBe(2);
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: ["leader", "admin"].map((userId) => ({
        userId,
        type: "CLOSURE_NOT_CONFIRMED",
        title: "Cierre no confirmado",
        message: "El cierre de Centro quedó bloqueado.",
        branchId,
        productId: null,
      })),
    });
  });

  it("does not write anything without recipients", async () => {
    await expect(
      service.createForUsers(tx as never, [], {
        type: "LOW_STOCK",
        title: "Inventario bajo",
        message: "x",
      }),
    ).resolves.toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});
