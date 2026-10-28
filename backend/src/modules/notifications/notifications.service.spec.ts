import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotificationsService } from "./notifications.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const prisma = {
  $transaction: jest.fn<(operations: unknown[]) => Promise<unknown[]>>(),
  notification: {
    count: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    findFirst: jest.fn<AsyncMock>(),
    findUniqueOrThrow: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
    updateMany: jest.fn<AsyncMock>(),
  },
};

describe("NotificationsService", () => {
  let service: NotificationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operations) =>
      Promise.all(operations),
    );
    service = new NotificationsService(prisma as never);
  });

  it("lists the notifications of the user with the filters", async () => {
    prisma.notification.count.mockResolvedValue(21);
    prisma.notification.findMany.mockResolvedValue([]);

    const result = await service.findMine("user-1", {
      page: 2,
      limit: 20,
      read: false,
      type: "LOW_STOCK",
    });

    const where = { userId: "user-1", read: false, type: "LOW_STOCK" };
    expect(prisma.notification.count).toHaveBeenCalledWith({ where });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { createdAt: "desc" },
        skip: 20,
        take: 20,
      }),
    );
    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    });
  });

  it("does not filter by read state when it is not sent", async () => {
    prisma.notification.count.mockResolvedValue(0);
    prisma.notification.findMany.mockResolvedValue([]);

    const result = await service.findMine("user-1", { page: 1, limit: 20 });

    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(result.meta.totalPages).toBe(0);
  });

  it.each([true, false])(
    "filters only the current user's notifications with read=%s",
    async (read) => {
      prisma.notification.count.mockResolvedValue(1);
      prisma.notification.findMany.mockResolvedValue([
        {
          id: "n-1",
          userId: "user-1",
          read,
          title: "Stock notification",
        },
      ]);

      const result = await service.findMine("user-1", {
        page: 1,
        limit: 10,
        read,
      });

      const where = { userId: "user-1", read };
      expect(prisma.notification.count).toHaveBeenCalledWith({ where });
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 0, take: 10 }),
      );
      expect(result.data).toEqual([
        {
          id: "n-1",
          userId: "user-1",
          read,
          title: "Stock notification",
        },
      ]);
    },
  );

  it("counts only the unread notifications of the user", async () => {
    prisma.notification.count.mockResolvedValue(4);

    await expect(service.unreadCount("user-1")).resolves.toEqual({ unread: 4 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
    });
  });

  it("marks a notification of the user as read", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "n-1", read: false });
    prisma.notification.update.mockResolvedValue({ id: "n-1", read: true });

    await expect(service.markRead("user-1", "n-1")).resolves.toEqual({
      id: "n-1",
      read: true,
    });
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: "n-1", userId: "user-1" },
      select: { id: true, read: true },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "n-1" },
        data: { read: true },
      }),
    );
  });

  it("does not write again when the notification was already read", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "n-1", read: true });
    prisma.notification.findUniqueOrThrow.mockResolvedValue({
      id: "n-1",
      read: true,
    });

    await service.markRead("user-1", "n-1");

    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("answers 404 when the notification belongs to someone else", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(service.markRead("user-1", "n-9")).rejects.toMatchObject({
      status: 404,
      response: { code: "NOTIFICATION_NOT_FOUND" },
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it("marks every unread notification of the user", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.markAllRead("user-1")).resolves.toEqual({
      updated: 3,
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", read: false },
      data: { read: true },
    });
  });
});
