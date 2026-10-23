import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateCountsDto } from "./dto/update-counts.dto.js";
import { ListClosuresQueryDto } from "./dto/list-closures-query.dto.js";

@Injectable()
export class InventoryClosuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(branchId: string, currentUser: AuthenticatedUser, ipAddress?: string) {
    this.assertBranchScope(branchId, currentUser);

    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true, active: true },
      });
      if (!branch) {
        throw new NotFoundException({
          code: "BRANCH_NOT_FOUND",
          message: "Branch not found.",
        });
      }
      if (!branch.active) {
        throw new UnprocessableEntityException({
          code: "BRANCH_INACTIVE",
          message: "Branch is inactive.",
        });
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const existing = await tx.inventoryClosure.findUnique({
        where: { branchId_closureDate: { branchId, closureDate: today } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: "CLOSURE_ALREADY_EXISTS",
          message: "An inventory closure already exists for this branch today.",
          details: { closureId: existing.id },
        });
      }

      const inventoryRows = await tx.branchInventory.findMany({
        where: {
          branchId,
          product: { active: true },
        },
        select: {
          productId: true,
          quantity: true,
          product: {
            select: {
              name: true,
              referenceCode: true,
              unitOfMeasure: { select: { abreviation: true } },
            },
          },
        },
      });

      const productMap = new Map<
        string,
        { name: string; referenceCode: string; unit: string; totalQty: number }
      >();
      for (const row of inventoryRows) {
        const existing = productMap.get(row.productId);
        if (existing) {
          existing.totalQty += row.quantity;
        } else {
          productMap.set(row.productId, {
            name: row.product.name,
            referenceCode: row.product.referenceCode,
            unit: row.product.unitOfMeasure.abreviation,
            totalQty: row.quantity,
          });
        }
      }

      const closure = await tx.inventoryClosure.create({
        data: {
          branchId,
          userId: currentUser.id,
          closureDate: today,
          status: "PENDING",
          confirmed: false,
          locked: false,
          details: {
            create: Array.from(productMap.entries()).map(([productId, info]) => ({
              productId,
              systemQuantity: info.totalQty,
            })),
          },
        },
        select: {
          id: true,
          branchId: true,
          closureDate: true,
          status: true,
          confirmed: true,
          locked: true,
          closedAt: true,
          details: {
            select: {
              productId: true,
              physicalQuantity: true,
              observation: true,
              product: {
                select: {
                  name: true,
                  referenceCode: true,
                  unitOfMeasure: { select: { abreviation: true } },
                },
              },
            },
          },
        },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "INVENTORY_CLOSURE",
          entityId: closure.id,
          newData: {
            branchId,
            closureDate: today.toISOString().slice(0, 10),
            itemsCount: productMap.size,
          },
          reason: `Inventory closure created for branch ${branchId}`,
          ipAddress,
        },
        tx,
      );

      return {
        id: closure.id,
        branchId: closure.branchId,
        closureDate: closure.closureDate,
        status: closure.status,
        confirmed: closure.confirmed,
        locked: closure.locked,
        closedAt: closure.closedAt,
        items: closure.details.map((d) => ({
          productId: d.productId,
          productName: d.product.name,
          referenceCode: d.product.referenceCode,
          unit: d.product.unitOfMeasure.abreviation,
          physicalQuantity: d.physicalQuantity,
          observation: d.observation,
        })),
      };
    });
  }

  async updateCounts(
    closureId: string,
    dto: UpdateCountsDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const closure = await tx.inventoryClosure.findUnique({
        where: { id: closureId },
        select: {
          id: true,
          branchId: true,
          status: true,
          locked: true,
          details: {
            select: {
              id: true,
              productId: true,
              systemQuantity: true,
            },
          },
        },
      });

      if (!closure) {
        throw new NotFoundException({
          code: "CLOSURE_NOT_FOUND",
          message: "Inventory closure not found.",
        });
      }

      this.assertBranchScope(closure.branchId, currentUser);

      if (closure.status !== "PENDING") {
        throw new UnprocessableEntityException({
          code: "CLOSURE_NOT_PENDING",
          message: "Inventory closure is not in PENDING status.",
        });
      }

      if (closure.locked) {
        throw new UnprocessableEntityException({
          code: "CLOSURE_LOCKED",
          message: "Inventory closure is locked.",
        });
      }

      const productIds = dto.counts.map((c) => c.productId);
      const uniqueIds = new Set(productIds);
      if (uniqueIds.size !== productIds.length) {
        throw new UnprocessableEntityException({
          code: "DUPLICATED_PRODUCT",
          message: "Counts contain duplicated products.",
        });
      }

      const detailMap = new Map(
        closure.details.map((d) => [d.productId, d]),
      );

      for (const count of dto.counts) {
        if (!detailMap.has(count.productId)) {
          throw new UnprocessableEntityException({
            code: "PRODUCT_NOT_IN_CLOSURE",
            message: `Product ${count.productId} is not part of this closure.`,
          });
        }
      }

      for (const count of dto.counts) {
        const detail = detailMap.get(count.productId)!;
        const difference = count.physicalQuantity - detail.systemQuantity;
        await tx.inventoryClosureDetail.update({
          where: { id: detail.id },
          data: {
            physicalQuantity: count.physicalQuantity,
            difference,
            observation: count.observation ?? null,
          },
        });
      }

      const updated = await tx.inventoryClosure.findUnique({
        where: { id: closureId },
        select: {
          id: true,
          branchId: true,
          closureDate: true,
          status: true,
          confirmed: true,
          locked: true,
          closedAt: true,
          details: {
            select: {
              productId: true,
              physicalQuantity: true,
              observation: true,
              product: {
                select: {
                  name: true,
                  referenceCode: true,
                  unitOfMeasure: { select: { abreviation: true } },
                },
              },
            },
          },
        },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "UPDATE",
          entity: "INVENTORY_CLOSURE",
          entityId: closureId,
          newData: {
            countsUpdated: dto.counts.length,
          },
          reason: `Physical counts updated for closure ${closureId}`,
          ipAddress,
        },
        tx,
      );

      return {
        id: updated!.id,
        branchId: updated!.branchId,
        closureDate: updated!.closureDate,
        status: updated!.status,
        confirmed: updated!.confirmed,
        locked: updated!.locked,
        closedAt: updated!.closedAt,
        items: updated!.details.map((d) => ({
          productId: d.productId,
          productName: d.product.name,
          referenceCode: d.product.referenceCode,
          unit: d.product.unitOfMeasure.abreviation,
          physicalQuantity: d.physicalQuantity,
          observation: d.observation,
        })),
      };
    });
  }

  async confirm(
    closureId: string,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const closure = await tx.inventoryClosure.findUnique({
        where: { id: closureId },
        select: {
          id: true,
          branchId: true,
          status: true,
          locked: true,
          details: {
            select: {
              id: true,
              productId: true,
              systemQuantity: true,
              physicalQuantity: true,
              difference: true,
              observation: true,
              product: {
                select: {
                  name: true,
                  referenceCode: true,
                  unitOfMeasure: { select: { abreviation: true } },
                },
              },
            },
          },
        },
      });

      if (!closure) {
        throw new NotFoundException({
          code: "CLOSURE_NOT_FOUND",
          message: "Inventory closure not found.",
        });
      }

      this.assertBranchScope(closure.branchId, currentUser);

      if (closure.status !== "PENDING") {
        throw new UnprocessableEntityException({
          code: "CLOSURE_NOT_PENDING",
          message: "Inventory closure is not in PENDING status.",
        });
      }

      const missing = closure.details.filter((d) => d.physicalQuantity === null);
      if (missing.length > 0) {
        throw new UnprocessableEntityException({
          code: "COUNTS_INCOMPLETE",
          message: "All items must have a physical count before confirming.",
          details: {
            missingProducts: missing.map((d) => d.productId),
          },
        });
      }

      const now = new Date();

      const updated = await tx.inventoryClosure.update({
        where: { id: closureId },
        data: {
          status: "CONFIRMED",
          confirmed: true,
          locked: true,
          closedAt: now,
        },
        select: {
          id: true,
          branchId: true,
          closureDate: true,
          status: true,
          confirmed: true,
          locked: true,
          closedAt: true,
          details: {
            select: {
              productId: true,
              systemQuantity: true,
              physicalQuantity: true,
              difference: true,
              observation: true,
              product: {
                select: {
                  name: true,
                  referenceCode: true,
                  unitOfMeasure: { select: { abreviation: true } },
                },
              },
            },
          },
        },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "UPDATE",
          entity: "INVENTORY_CLOSURE",
          entityId: closureId,
          newData: {
            status: "CONFIRMED",
            confirmedAt: now.toISOString(),
          },
          reason: `Inventory closure ${closureId} confirmed`,
          ipAddress,
        },
        tx,
      );

      return {
        id: updated.id,
        branchId: updated.branchId,
        closureDate: updated.closureDate,
        status: updated.status,
        confirmed: updated.confirmed,
        locked: updated.locked,
        closedAt: updated.closedAt,
        items: updated.details.map((d) => ({
          productId: d.productId,
          productName: d.product.name,
          referenceCode: d.product.referenceCode,
          unit: d.product.unitOfMeasure.abreviation,
          systemQuantity: d.systemQuantity,
          physicalQuantity: d.physicalQuantity,
          difference: d.difference,
          observation: d.observation,
        })),
      };
    });
  }

  async findAll(query: ListClosuresQueryDto) {
    const { page, limit, branchId, status, from, to } = query;

    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    if (from || to) {
      where.closureDate = {};
      if (from) where.closureDate.gte = new Date(`${from}T00:00:00Z`);
      if (to) where.closureDate.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const skip = (page - 1) * limit;

    const [total, closures] = await this.prisma.$transaction([
      this.prisma.inventoryClosure.count({ where }),
      this.prisma.inventoryClosure.findMany({
        where,
        skip,
        take: limit,
        orderBy: { closureDate: "desc" },
        select: {
          id: true,
          branchId: true,
          closureDate: true,
          status: true,
          confirmed: true,
          locked: true,
          closedAt: true,
          branch: { select: { name: true } },
          _count: { select: { details: true } },
        },
      }),
    ]);

    return {
      data: closures.map((c) => ({
        id: c.id,
        branchId: c.branchId,
        branchName: c.branch.name,
        closureDate: c.closureDate,
        status: c.status,
        confirmed: c.confirmed,
        locked: c.locked,
        closedAt: c.closedAt,
        itemsCount: c._count.details,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  private assertBranchScope(branchId: string, currentUser: AuthenticatedUser) {
    const roleName = currentUser.role?.name;
    if (roleName === "SUPERADMIN" || roleName === "DEV") return;

    if (roleName === "BRANCH_LEADER" || roleName === "BRANCH_ASSISTANT") {
      const branches = currentUser.branches ?? [];
      const hasAccess = branches.some((b) => b.id === branchId);
      if (!hasAccess) {
        throw new ForbiddenException({
          code: "FORBIDDEN_BRANCH",
          message: "You do not have access to this branch.",
        });
      }
    }
  }
}
