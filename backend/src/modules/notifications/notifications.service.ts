import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto.js";

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  message: true,
  branchId: true,
  productId: true,
  read: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string, query: ListNotificationsQueryDto) {
    const { page, limit, read, type } = query;
    const where = {
      userId,
      ...(read === undefined ? {} : { read }),
      ...(type ? { type } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: notificationSelect,
      }),
    ]);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async unreadCount(userId: string) {
    const unread = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { unread };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, read: true },
    });
    if (!notification) {
      throw new NotFoundException({
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found",
      });
    }
    if (notification.read) {
      return this.prisma.notification.findUniqueOrThrow({
        where: { id: notificationId },
        select: notificationSelect,
      });
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
      select: notificationSelect,
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }
}
