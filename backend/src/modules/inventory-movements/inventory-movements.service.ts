import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateTransferDto } from "./dto/create-transfer.dto.js";
import { AdjustmentType, CreateAdjustmentDto } from "./dto/create-adjustment.dto.js";

@Injectable()
export class InventoryMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createTransfer(
    dto: CreateTransferDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { originBranchId, destinationBranchId, items } = dto;

    if (originBranchId === destinationBranchId) {
      throw new UnprocessableEntityException({
        code: "SAME_BRANCH",
        message: "Origin and destination branches must be different.",
      });
    }

    this.assertBranchScope(originBranchId, currentUser);

    const keys = items.map((i) => `${i.productId}:${i.expirationDate}`);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new UnprocessableEntityException({
        code: "DUPLICATED_ITEM",
        message: "Items contain duplicated product and expiration date combinations.",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const [originBranch, destBranch] = await Promise.all([
        tx.branch.findUnique({
          where: { id: originBranchId },
          select: { id: true, name: true, active: true },
        }),
        tx.branch.findUnique({
          where: { id: destinationBranchId },
          select: { id: true, name: true, active: true },
        }),
      ]);

      if (!originBranch) {
        throw new NotFoundException({
          code: "ORIGIN_BRANCH_NOT_FOUND",
          message: "Origin branch not found.",
        });
      }
      if (!originBranch.active) {
        throw new UnprocessableEntityException({
          code: "ORIGIN_BRANCH_INACTIVE",
          message: "Origin branch is inactive.",
        });
      }
      if (!destBranch) {
        throw new NotFoundException({
          code: "DESTINATION_BRANCH_NOT_FOUND",
          message: "Destination branch not found.",
        });
      }
      if (!destBranch.active) {
        throw new UnprocessableEntityException({
          code: "DESTINATION_BRANCH_INACTIVE",
          message: "Destination branch is inactive.",
        });
      }

      const productIds = [...new Set(items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          active: true,
          unitOfMeasure: { select: { abreviation: true } },
        },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new NotFoundException({
            code: "PRODUCT_NOT_FOUND",
            message: `Product ${item.productId} not found.`,
          });
        }
        if (!product.active) {
          throw new UnprocessableEntityException({
            code: "PRODUCT_INACTIVE",
            message: `Product "${product.name}" is inactive.`,
          });
        }
      }

      const movements: Array<{
        id: string;
        productId: string;
        productName: string;
        referenceCode: string;
        unit: string;
        quantity: number;
        expirationDate: string;
        observation: string | null;
      }> = [];

      for (const item of items) {
        const expDate = new Date(item.expirationDate);
        const product = productMap.get(item.productId)!;

        await tx.$queryRaw`
          SELECT id FROM branch_inventory
          WHERE branch_id = ${originBranchId}::uuid
            AND product_id = ${item.productId}::uuid
            AND expiration_date = ${expDate}
          FOR UPDATE
        `;

        const originLot = await tx.branchInventory.findUnique({
          where: {
            branchId_productId_expirationDate: {
              branchId: originBranchId,
              productId: item.productId,
              expirationDate: expDate,
            },
          },
          select: { id: true, quantity: true },
        });

        if (!originLot) {
          throw new UnprocessableEntityException({
            code: "LOT_NOT_FOUND",
            message: `Product "${product.name}" with expiration ${item.expirationDate} not found in origin branch.`,
          });
        }

        if (originLot.quantity < item.quantity) {
          throw new UnprocessableEntityException({
            code: "INSUFFICIENT_STOCK",
            message: `Insufficient stock for "${product.name}" (available: ${originLot.quantity}, requested: ${item.quantity}).`,
          });
        }

        await tx.branchInventory.update({
          where: { id: originLot.id },
          data: { quantity: { decrement: item.quantity } },
        });

        const destLot = await tx.branchInventory.findUnique({
          where: {
            branchId_productId_expirationDate: {
              branchId: destinationBranchId,
              productId: item.productId,
              expirationDate: expDate,
            },
          },
          select: { id: true },
        });

        if (destLot) {
          await tx.branchInventory.update({
            where: { id: destLot.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          await tx.branchInventory.create({
            data: {
              branchId: destinationBranchId,
              productId: item.productId,
              quantity: item.quantity,
              minimumStock: 0,
              expirationDate: expDate,
            },
          });
        }

        const movement = await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            branchId: destinationBranchId,
            originBranchId,
            userId: currentUser.id,
            movementType: "TRANSFER",
            quantity: item.quantity,
            observation: item.observation ?? null,
          },
          select: { id: true },
        });

        movements.push({
          id: movement.id,
          productId: item.productId,
          productName: product.name,
          referenceCode: product.referenceCode,
          unit: product.unitOfMeasure.abreviation,
          quantity: item.quantity,
          expirationDate: item.expirationDate,
          observation: item.observation ?? null,
        });
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "INVENTORY_TRANSFER",
          entityId: movements[0].id,
          newData: {
            originBranchId,
            destinationBranchId,
            itemsCount: items.length,
            totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
          },
          reason: `Transfer from ${originBranch.name} to ${destBranch.name}`,
          ipAddress,
        },
        tx,
      );

      return {
        originBranch: {
          id: originBranch.id,
          name: originBranch.name,
        },
        destinationBranch: {
          id: destBranch.id,
          name: destBranch.name,
        },
        items: movements,
      };
    });
  }

  async createAdjustment(
    dto: CreateAdjustmentDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { branchId, adjustmentType, reason, items } = dto;

    this.assertBranchScope(branchId, currentUser);

    const keys = items.map((i) => `${i.productId}:${i.expirationDate}`);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new UnprocessableEntityException({
        code: "DUPLICATED_ITEM",
        message: "Items contain duplicated product and expiration date combinations.",
      });
    }

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

      const productIds = [...new Set(items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          active: true,
          unitOfMeasure: { select: { abreviation: true } },
        },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new NotFoundException({
            code: "PRODUCT_NOT_FOUND",
            message: `Product ${item.productId} not found.`,
          });
        }
        if (!product.active) {
          throw new UnprocessableEntityException({
            code: "PRODUCT_INACTIVE",
            message: `Product "${product.name}" is inactive.`,
          });
        }
      }

      const movementType =
        adjustmentType === AdjustmentType.ENTRY ? "ADJUSTMENT_ENTRY" : "ADJUSTMENT_EXIT";

      const movements: Array<{
        id: string;
        productId: string;
        productName: string;
        referenceCode: string;
        unit: string;
        quantity: number;
        expirationDate: string;
        observation: string | null;
      }> = [];

      for (const item of items) {
        const expDate = new Date(item.expirationDate);
        const product = productMap.get(item.productId)!;

        if (adjustmentType === AdjustmentType.EXIT) {
          await tx.$queryRaw`
            SELECT id FROM branch_inventory
            WHERE branch_id = ${branchId}::uuid
              AND product_id = ${item.productId}::uuid
              AND expiration_date = ${expDate}
            FOR UPDATE
          `;

          const lot = await tx.branchInventory.findUnique({
            where: {
              branchId_productId_expirationDate: {
                branchId,
                productId: item.productId,
                expirationDate: expDate,
              },
            },
            select: { id: true, quantity: true },
          });

          if (!lot) {
            throw new UnprocessableEntityException({
              code: "LOT_NOT_FOUND",
              message: `Product "${product.name}" with expiration ${item.expirationDate} not found in branch.`,
            });
          }
          if (lot.quantity < item.quantity) {
            throw new UnprocessableEntityException({
              code: "INSUFFICIENT_STOCK",
              message: `Insufficient stock for "${product.name}" (available: ${lot.quantity}, requested: ${item.quantity}).`,
            });
          }

          await tx.branchInventory.update({
            where: { id: lot.id },
            data: { quantity: { decrement: item.quantity } },
          });
        } else {
          const existingLot = await tx.branchInventory.findUnique({
            where: {
              branchId_productId_expirationDate: {
                branchId,
                productId: item.productId,
                expirationDate: expDate,
              },
            },
            select: { id: true },
          });

          if (existingLot) {
            await tx.branchInventory.update({
              where: { id: existingLot.id },
              data: { quantity: { increment: item.quantity } },
            });
          } else {
            await tx.branchInventory.create({
              data: {
                branchId,
                productId: item.productId,
                quantity: item.quantity,
                minimumStock: 0,
                expirationDate: expDate,
              },
            });
          }
        }

        const movement = await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            branchId,
            userId: currentUser.id,
            movementType,
            quantity: item.quantity,
            observation: item.observation ?? null,
          },
          select: { id: true },
        });

        movements.push({
          id: movement.id,
          productId: item.productId,
          productName: product.name,
          referenceCode: product.referenceCode,
          unit: product.unitOfMeasure.abreviation,
          quantity: item.quantity,
          expirationDate: item.expirationDate,
          observation: item.observation ?? null,
        });
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "INVENTORY_ADJUSTMENT",
          entityId: movements[0].id,
          newData: {
            branchId,
            adjustmentType,
            itemsCount: items.length,
            totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
          },
          reason,
          ipAddress,
        },
        tx,
      );

      return {
        branch: {
          id: branch.id,
          name: branch.name,
        },
        adjustmentType,
        reason,
        items: movements,
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
          message: "You do not have access to the origin branch.",
        });
      }
    }
  }
}
