import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { NotificationType } from "../../../generated/prisma/enums.js";

export type TransactionClient = Prisma.TransactionClient;

export interface NotificationContent {
  type: NotificationType;
  title: string;
  message: string;
  branchId?: string | null;
  productId?: string | null;
}

@Injectable()
export class NotificationWriterService {
  async branchManagerIds(
    tx: TransactionClient,
    branchId: string,
  ): Promise<string[]> {
    const users = await tx.userAccount.findMany({
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
    return users.map((user) => user.personId);
  }

  async superadminIds(tx: TransactionClient): Promise<string[]> {
    const users = await tx.userAccount.findMany({
      where: {
        active: true,
        person: { active: true },
        role: { name: "SUPERADMIN" },
      },
      select: { personId: true },
    });
    return users.map((user) => user.personId);
  }

  async createForUsers(
    tx: TransactionClient,
    userIds: string[],
    content: NotificationContent,
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const result = await tx.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: content.type,
        title: content.title,
        message: content.message,
        branchId: content.branchId ?? null,
        productId: content.productId ?? null,
      })),
    });
    return result.count;
  }
}
