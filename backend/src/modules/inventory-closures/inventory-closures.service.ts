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
