import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AssignProductDto } from "./dto/assign-product.dto.js";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async assignProductToBranch(
    branchId: string,
    dto: AssignProductDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    this.assertBranchScope(branchId, currentUser);

    return this.prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true, active: true },
      });
      if (!branch) {
        throw new NotFoundException({
          code: "BRANCH_NOT_FOUND",
          message: "Branch not found",
        });
      }
      if (!branch.active) {
        throw new UnprocessableEntityException({
          code: "BRANCH_INACTIVE",
          message: "Branch is inactive",
        });
      }

      const product = await transaction.product.findUnique({
        where: { id: dto.productId },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          active: true,
          price: true,
          category: { select: { id: true, name: true } },
          unitOfMeasure: { select: { abreviation: true } },
        },
      });
      if (!product) {
        throw new NotFoundException({
          code: "PRODUCT_NOT_FOUND",
          message: "Product not found",
        });
      }
      if (!product.active) {
        throw new UnprocessableEntityException({
          code: "PRODUCT_INACTIVE",
          message: "Product is inactive",
        });
      }

      await transaction.$queryRaw`SELECT id FROM product WHERE id = ${dto.productId} FOR UPDATE`;

      const expirationDate = new Date(dto.expirationDate);
      const existingInventory = await transaction.branchInventory.findUnique({
        where: {
          branchId_productId_expirationDate: {
            branchId,
            productId: dto.productId,
            expirationDate,
          },
        },
        select: { id: true },
      });
      if (existingInventory) {
        throw new ConflictException({
          code: "PRODUCT_ALREADY_ASSIGNED",
          message:
            "Product is already assigned to this branch with the same expiration date",
        });
      }

      const inventory = await transaction.branchInventory.create({
        data: {
          branchId,
          productId: dto.productId,
          quantity: dto.quantity,
          minimumStock: dto.minimumStock,
          expirationDate,
        },
      });

      if (dto.quantity > 0) {
        await transaction.inventoryMovement.create({
          data: {
            productId: dto.productId,
            branchId,
            originBranchId: null,
            userId: currentUser.id,
            movementType: "TRANSFER",
            quantity: dto.quantity,
            observation:
              dto.observation ?? "Initial assignment from general stock",
          },
        });
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "ASSIGN",
          entity: "branch_inventory",
          entityId: inventory.id,
          newData: {
            ...inventory,
            expirationDate: inventory.expirationDate.toISOString(),
          },
          reason: "Product assigned to branch",
          ipAddress,
        },
        transaction,
      );

      return {
        data: {
          id: inventory.id,
          branchId: inventory.branchId,
          product: {
            id: product.id,
            name: product.name,
            referenceCode: product.referenceCode,
            category: product.category,
            unitOfMeasure: { abbreviation: product.unitOfMeasure.abreviation },
            price: product.price.toFixed(2),
            active: product.active,
          },
          quantity: inventory.quantity,
          minimumStock: inventory.minimumStock,
          lowStock: inventory.quantity < inventory.minimumStock,
          expirationDate: inventory.expirationDate,
          updatedAt: inventory.updatedAt,
        },
      };
    });
  }

  private assertBranchScope(branchId: string, currentUser: AuthenticatedUser) {
    const roleName = currentUser.role?.name;
    if (roleName === "SUPERADMIN") return;

    if (roleName === "BRANCH_LEADER") {
      const branches = currentUser.branches ?? [];
      const hasAccess = branches.some((b) => b.id === branchId);
      if (!hasAccess) {
        throw new ForbiddenException({
          code: "BRANCH_OUT_OF_SCOPE",
          message: "You do not have access to this branch",
        });
      }
      return;
    }

    throw new ForbiddenException({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
  }
}
