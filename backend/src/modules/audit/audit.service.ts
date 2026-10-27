import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto.js";

export type AuditLogTransaction = Pick<Prisma.TransactionClient, "auditLog">;

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
    const { page, limit, userId, action, entity, entityId } = query;
    const fromValue = query.from ?? query.fromDate;
    const toValue = query.to ?? query.toDate;
    const startDate = fromValue ? new Date(fromValue) : undefined;
    let endDate = toValue ? new Date(toValue) : undefined;

    if (toValue && /^\d{4}-\d{2}-\d{2}$/.test(toValue)) {
      endDate = new Date(`${toValue}T23:59:59.999Z`);
    }
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        "fromDate must be before or equal to toDate",
      );
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(userId ? { userId } : {}),
      ...(action ? { action } : {}),
      ...(entity ? { entity: { equals: entity, mode: "insensitive" } } : {}),
      ...(entityId ? { entityId } : {}),
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
                  businessName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: logs.map(({ id, userAccount, ...log }) => {
        const person = userAccount?.person;
        const { businessName, ...personData } = person ?? {};
        const fullName = person
          ? [person.firstName, person.lastName].filter(Boolean).join(" ") ||
            businessName ||
            person.email
          : null;
        return {
          id: id.toString(),
          ...log,
          user: person ? { id: person.id, fullName } : null,
          userAccount: person ? { person: personData } : null,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }
}
