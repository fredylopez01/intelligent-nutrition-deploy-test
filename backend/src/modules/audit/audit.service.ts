import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto.js";

type AuditLogTransaction = Pick<Prisma.TransactionClient, "auditLog">;

export interface CreateAuditLogInput {
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  reason: string;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async createAuditLog(
    input: CreateAuditLogInput,
    transaction?: AuditLogTransaction,
  ) {
    const client = transaction ?? this.prisma;
    return client.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        oldData:
          input.oldData === undefined
            ? undefined
            : ((input.oldData ?? Prisma.DbNull) as Prisma.InputJsonValue),
        newData:
          input.newData === undefined
            ? undefined
            : ((input.newData ?? Prisma.DbNull) as Prisma.InputJsonValue),
        reason: input.reason,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async findAll(query: ListAuditLogsQueryDto) {
    const { page, limit, userId, action, fromDate, toDate } = query;
    const startDate = fromDate ? new Date(fromDate) : undefined;
    let endDate = toDate ? new Date(toDate) : undefined;

    if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      endDate = new Date(`${toDate}T23:59:59.999Z`);
    }
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        "fromDate must be before or equal to toDate",
      );
    }

    const where = {
      ...(userId ? { entity: "USER", entityId: userId } : {}),
      ...(action ? { action } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    };
    const skip = (page - 1) * limit;
    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          userAccount: {
            select: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: logs.map(({ id, ...log }) => ({ id: id.toString(), ...log })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }
}
