import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import type { SaleStatus } from "../../../generated/prisma/enums.js";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateSaleDto } from "./dto/create-sale.dto.js";
import { ListSalesQueryDto } from "./dto/list-sales-query.dto.js";
import { ReverseSaleDto } from "./dto/reverse-sale.dto.js";

const saleSelect = {
  id: true,
  saleNumber: true,
  status: true,
  saleAt: true,
  subtotal: true,
  discountAmount: true,
  taxAmount: true,
  total: true,
  reversalReason: true,
  reversedAt: true,
  branch: {
    select: { id: true, name: true },
  },
  user: {
    select: {
      personId: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
  customer: {
    select: { personId: true, fullName: true },
  },
  details: {
    select: {
      productId: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      total: true,
      product: {
        select: { name: true, referenceCode: true },
      },
    },
  },
  payments: {
    select: {
      amount: true,
      reference: true,
      paidAt: true,
      paymentMethod: {
        select: { id: true, code: true, name: true },
      },
    },
  },
} as const;

type SaleWithRelations = Prisma.SaleGetPayload<{ select: typeof saleSelect }>;

function toCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function toMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatSaleResponse(sale: SaleWithRelations) {
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    status: sale.status,
    branch: {
      id: sale.branch.id,
      name: sale.branch.name,
    },
    user: {
      id: sale.user.personId,
      fullName: [sale.user.person.firstName, sale.user.person.lastName]
        .filter(Boolean)
        .join(" "),
    },
    customer: sale.customer
      ? {
          id: sale.customer.personId,
          fullName: sale.customer.fullName,
        }
      : null,
    saleAt: sale.saleAt,
    subtotal: Number(sale.subtotal).toFixed(2),
    discountAmount: Number(sale.discountAmount).toFixed(2),
    taxAmount: Number(sale.taxAmount).toFixed(2),
    total: Number(sale.total).toFixed(2),
    items: sale.details.map((detail) => ({
      productId: detail.productId,
      productName: detail.product.name,
      referenceCode: detail.product.referenceCode,
      quantity: detail.quantity,
      unitPrice: Number(detail.unitPrice).toFixed(2),
      subtotal: Number(detail.subtotal).toFixed(2),
      discountAmount: Number(detail.discountAmount).toFixed(2),
      taxAmount: Number(detail.taxAmount).toFixed(2),
      total: Number(detail.total).toFixed(2),
    })),
    payments: sale.payments.map((payment) => ({
      paymentMethod: {
        id: payment.paymentMethod.id,
        code: payment.paymentMethod.code,
        name: payment.paymentMethod.name,
      },
      amount: Number(payment.amount).toFixed(2),
      reference: payment.reference,
      paidAt: payment.paidAt,
    })),
    reversalReason: sale.reversalReason,
    reversedAt: sale.reversedAt,
  };
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateSaleDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { branchId, customerId, items, payments } = dto;

    this.assertBranchScope(branchId, currentUser);

    const productIds = items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new UnprocessableEntityException({
        code: "DUPLICATED_PRODUCT",
        message: "Items contain duplicated products.",
      });
    }

    const paymentMethodIds = payments.map((payment) => payment.paymentMethodId);

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

      const now = new Date();
      const closureDate = new Date(now);
      closureDate.setUTCHours(0, 0, 0, 0);

      const closure = await tx.inventoryClosure.findUnique({
        where: { branchId_closureDate: { branchId, closureDate } },
        select: { status: true, locked: true },
      });

      if (closure && (closure.status === "CONFIRMED" || closure.locked)) {
        throw new UnprocessableEntityException({
          code: "INVENTORY_CLOSED",
          message: "The inventory for this branch is closed for today.",
        });
      }

      if (customerId) {
        const customer = await tx.customer.findUnique({
          where: { personId: customerId },
          select: { personId: true, active: true },
        });

        if (!customer) {
          throw new NotFoundException({
            code: "CUSTOMER_NOT_FOUND",
            message: "Customer not found.",
          });
        }
        if (!customer.active) {
          throw new UnprocessableEntityException({
            code: "CUSTOMER_INACTIVE",
            message: "Customer is inactive.",
          });
        }
      }

      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          referenceCode: true,
          price: true,
          active: true,
        },
      });
      const productMap = new Map(
        products.map((product) => [product.id, product]),
      );

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

      const paymentMethods = await tx.paymentMethod.findMany({
        where: { id: { in: paymentMethodIds } },
        select: { id: true, code: true, name: true, active: true },
      });
      const paymentMethodMap = new Map(
        paymentMethods.map((paymentMethod) => [
          paymentMethod.id,
          paymentMethod,
        ]),
      );

      for (const payment of payments) {
        const paymentMethod = paymentMethodMap.get(payment.paymentMethodId);
        if (!paymentMethod) {
          throw new NotFoundException({
            code: "PAYMENT_METHOD_NOT_FOUND",
            message: `Payment method ${payment.paymentMethodId} not found.`,
          });
        }
        if (!paymentMethod.active) {
          throw new UnprocessableEntityException({
            code: "PAYMENT_METHOD_INACTIVE",
            message: `Payment method "${paymentMethod.name}" is inactive.`,
          });
        }
      }

      let subtotalCents = 0;
      let itemsDiscountCents = 0;
      let itemsTaxCents = 0;

      const detailsData = items.map((item) => {
        const product = productMap.get(item.productId)!;
        const unitPriceCents = Math.round(Number(product.price) * 100);
        const itemSubtotalCents = unitPriceCents * item.quantity;
        const itemDiscountCents = toCents(item.discountAmount ?? "0.00");
        const itemTaxCents = toCents(item.taxAmount ?? "0.00");

        if (itemDiscountCents > itemSubtotalCents) {
          throw new UnprocessableEntityException({
            code: "DISCOUNT_EXCEEDS_SUBTOTAL",
            message: "Item discount cannot exceed its subtotal.",
            details: {
              productId: item.productId,
              subtotal: toMoney(itemSubtotalCents),
              discountAmount: toMoney(itemDiscountCents),
            },
          });
        }

        const itemTotalCents =
          itemSubtotalCents - itemDiscountCents + itemTaxCents;

        subtotalCents += itemSubtotalCents;
        itemsDiscountCents += itemDiscountCents;
        itemsTaxCents += itemTaxCents;

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: toMoney(unitPriceCents),
          subtotal: toMoney(itemSubtotalCents),
          discountAmount: toMoney(itemDiscountCents),
          taxAmount: toMoney(itemTaxCents),
          total: toMoney(itemTotalCents),
        };
      });

      const generalDiscountCents = toCents(dto.discountAmount ?? "0.00");
      const generalTaxCents = toCents(dto.taxAmount ?? "0.00");
      const discountAmountCents = itemsDiscountCents + generalDiscountCents;
      const taxAmountCents = itemsTaxCents + generalTaxCents;
      const totalCents = subtotalCents - discountAmountCents + taxAmountCents;

      if (totalCents < 0) {
        throw new UnprocessableEntityException({
          code: "DISCOUNT_EXCEEDS_SUBTOTAL",
          message: "Sale discount cannot exceed the sale subtotal.",
          details: {
            subtotal: toMoney(subtotalCents),
            discountAmount: toMoney(discountAmountCents),
          },
        });
      }

      let paymentsCents = 0;
      const paymentsData = payments.map((payment, index) => {
        const amountCents = toCents(payment.amount);

        if (amountCents <= 0) {
          throw new UnprocessableEntityException({
            code: "PAYMENT_AMOUNT_INVALID",
            message: "Payment amount must be greater than zero.",
            details: { index },
          });
        }

        paymentsCents += amountCents;

        return {
          paymentMethodId: payment.paymentMethodId,
          amount: toMoney(amountCents),
          reference: payment.reference ?? null,
        };
      });

      if (paymentsCents !== totalCents) {
        throw new UnprocessableEntityException({
          code: "PAYMENT_TOTAL_MISMATCH",
          message: "Payments total must match the sale total.",
          details: {
            expected: toMoney(totalCents),
            received: toMoney(paymentsCents),
          },
        });
      }

      const lotsByProduct = new Map<
        string,
        Array<{ id: string; quantity: number; minimumStock: number }>
      >();
      const insufficientStock: Array<{
        productId: string;
        productName: string;
        requested: number;
        available: number;
      }> = [];

      for (const item of items) {
        await tx.$queryRaw`
          SELECT id FROM branch_inventory
          WHERE branch_id = ${branchId}::uuid
            AND product_id = ${item.productId}::uuid
          FOR UPDATE
        `;

        const lots = await tx.branchInventory.findMany({
          where: { branchId, productId: item.productId },
          select: { id: true, quantity: true, minimumStock: true },
          orderBy: { expirationDate: "asc" },
        });

        const available = lots.reduce((sum, lot) => sum + lot.quantity, 0);

        if (available < item.quantity) {
          insufficientStock.push({
            productId: item.productId,
            productName: productMap.get(item.productId)!.name,
            requested: item.quantity,
            available,
          });
        }

        lotsByProduct.set(item.productId, lots);
      }

      if (insufficientStock.length > 0) {
        throw new UnprocessableEntityException({
          code: "INSUFFICIENT_STOCK",
          message: "One or more products do not have enough stock.",
          details: { items: insufficientStock },
        });
      }

      const saleNumber = await this.generateSaleNumber(tx, branchId, now);

      const sale = await tx.sale.create({
        data: {
          saleNumber,
          branchId,
          userId: currentUser.id,
          customerId: customerId ?? null,
          saleAt: now,
          subtotal: toMoney(subtotalCents),
          discountAmount: toMoney(discountAmountCents),
          taxAmount: toMoney(taxAmountCents),
          total: toMoney(totalCents),
          status: "COMPLETED",
          details: { create: detailsData },
          payments: { create: paymentsData },
        },
        select: saleSelect,
      });

      const lowStockAlerts: Array<{
        productId: string;
        productName: string;
        availableQuantity: number;
        minimumStock: number;
      }> = [];

      for (const item of items) {
        let remainingToDiscount = item.quantity;

        for (const lot of lotsByProduct.get(item.productId) ?? []) {
          if (remainingToDiscount === 0) {
            break;
          }

          const taken = Math.min(lot.quantity, remainingToDiscount);
          if (taken === 0) {
            continue;
          }

          await tx.branchInventory.update({
            where: { id: lot.id },
            data: { quantity: { decrement: taken } },
          });

          remainingToDiscount -= taken;
        }

        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            branchId,
            originBranchId: null,
            userId: currentUser.id,
            movementType: "EXIT",
            quantity: item.quantity,
            saleId: sale.id,
          },
        });

        const lots = lotsByProduct.get(item.productId) ?? [];
        const availableQuantity =
          lots.reduce((sum, lot) => sum + lot.quantity, 0) - item.quantity;
        const minimumStock = lots.reduce(
          (max, lot) => Math.max(max, lot.minimumStock),
          0,
        );

        if (availableQuantity < minimumStock) {
          lowStockAlerts.push({
            productId: item.productId,
            productName: productMap.get(item.productId)!.name,
            availableQuantity,
            minimumStock,
          });
        }
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "SALE",
          entityId: sale.id,
          newData: {
            saleNumber: sale.saleNumber,
            branchId,
            customerId: customerId ?? null,
            itemsCount: items.length,
            total: toMoney(totalCents),
            lowStockAlerts,
          },
          reason: `Sale ${sale.saleNumber} created at ${branch.name}`,
          ipAddress,
        },
        tx,
      );

      return formatSaleResponse(sale);
    });
  }

  async findAll(query: ListSalesQueryDto, currentUser: AuthenticatedUser) {
    const {
      page,
      limit,
      branchId,
      status,
      from,
      to,
      productId,
      customerId,
      search,
    } = query;

    const roleName = currentUser.role?.name;
    const isScopedRole =
      roleName === "BRANCH_LEADER" || roleName === "BRANCH_ASSISTANT";

    if (isScopedRole) {
      if (!branchId) {
        throw new ForbiddenException({
          code: "BRANCH_REQUIRED",
          message: "branchId is required for this role.",
        });
      }

      const userBranchIds = (currentUser.branches ?? []).map(
        (branch) => branch.id,
      );
      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException({
          code: "BRANCH_OUT_OF_SCOPE",
          message: "You do not have access to this branch",
        });
      }
    }

    const saleAtFilter: Prisma.DateTimeFilter = {};
    if (from) {
      saleAtFilter.gte = new Date(`${from}T00:00:00Z`);
    }
    if (to) {
      saleAtFilter.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const where: Prisma.SaleWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(status ? { status: status as SaleStatus } : {}),
      ...(customerId ? { customerId } : {}),
      ...(from || to ? { saleAt: saleAtFilter } : {}),
      ...(productId ? { details: { some: { productId } } } : {}),
      ...(search
        ? { saleNumber: { contains: search, mode: "insensitive" } }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [total, sales] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { saleAt: "desc" },
        select: {
          id: true,
          saleNumber: true,
          status: true,
          saleAt: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          total: true,
          reversalReason: true,
          reversedAt: true,
          branch: {
            select: { id: true, name: true },
          },
          user: {
            select: {
              personId: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
          customer: {
            select: { personId: true, fullName: true },
          },
          _count: { select: { details: true } },
        },
      }),
    ]);

    return {
      data: sales.map((sale) => ({
        id: sale.id,
        saleNumber: sale.saleNumber,
        status: sale.status,
        branch: {
          id: sale.branch.id,
          name: sale.branch.name,
        },
        user: {
          id: sale.user.personId,
          fullName: [sale.user.person.firstName, sale.user.person.lastName]
            .filter(Boolean)
            .join(" "),
        },
        customer: sale.customer
          ? {
              id: sale.customer.personId,
              fullName: sale.customer.fullName,
            }
          : null,
        saleAt: sale.saleAt,
        subtotal: Number(sale.subtotal).toFixed(2),
        discountAmount: Number(sale.discountAmount).toFixed(2),
        taxAmount: Number(sale.taxAmount).toFixed(2),
        total: Number(sale.total).toFixed(2),
        reversalReason: sale.reversalReason,
        reversedAt: sale.reversedAt,
        itemsCount: sale._count.details,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(saleId: string, currentUser: AuthenticatedUser) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      select: saleSelect,
    });

    if (!sale) {
      throw new NotFoundException({
        code: "SALE_NOT_FOUND",
        message: "Sale not found.",
      });
    }

    const roleName = currentUser.role?.name;
    if (roleName === "BRANCH_LEADER" || roleName === "BRANCH_ASSISTANT") {
      const userBranchIds = (currentUser.branches ?? []).map(
        (branch) => branch.id,
      );
      if (!userBranchIds.includes(sale.branch.id)) {
        throw new ForbiddenException({
          code: "BRANCH_OUT_OF_SCOPE",
          message: "You do not have access to this branch",
        });
      }
    }

    return formatSaleResponse(sale);
  }

  async reverse(
    saleId: string,
    dto: ReverseSaleDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { reason } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1) Cargar la venta con detalles
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: {
          id: true,
          saleNumber: true,
          status: true,
          branchId: true,
          saleAt: true,
          total: true,
          details: {
            select: {
              id: true,
              productId: true,
              quantity: true,
            },
          },
        },
      });

      if (!sale) {
        throw new NotFoundException({
          code: "SALE_NOT_FOUND",
          message: "Sale not found.",
        });
      }

      // 2) Scope por sucursal (mismo criterio que create / findOne)
      this.assertBranchScope(sale.branchId, currentUser);

      // 3) Estado: solo COMPLETED puede reversarse
      if (sale.status === "REVERSED") {
        throw new ConflictException({
          code: "SALE_ALREADY_REVERSED",
          message: "Sale is already reversed.",
        });
      }
      if (sale.status !== "COMPLETED") {
        throw new ConflictException({
          code: "SALE_NOT_REVERSIBLE",
          message: `Only COMPLETED sales can be reversed. Current status: ${sale.status}.`,
        });
      }

      const saleDate = new Date(sale.saleAt);
      const closureDate = new Date(saleDate);
      closureDate.setUTCHours(0, 0, 0, 0);

      const closure = await tx.inventoryClosure.findUnique({
        where: {
          branchId_closureDate: {
            branchId: sale.branchId,
            closureDate,
          },
        },
        select: { status: true, locked: true },
      });

      if (closure && (closure.status === "CONFIRMED" || closure.locked)) {
        throw new UnprocessableEntityException({
          code: "SALE_DAY_CLOSED",
          message:
            "The sale belongs to a closed day; use a SUPERADMIN adjustment instead.",
        });
      }

      for (const detail of sale.details) {
        await tx.$queryRaw`
          SELECT id FROM branch_inventory
          WHERE branch_id = ${sale.branchId}::uuid
            AND product_id = ${detail.productId}::uuid
          FOR UPDATE
        `;

        const lots = await tx.branchInventory.findMany({
          where: {
            branchId: sale.branchId,
            productId: detail.productId,
          },
          select: { id: true, quantity: true, expirationDate: true },
          orderBy: { expirationDate: "asc" },
        });

        if (lots.length === 0) {
          throw new UnprocessableEntityException({
            code: "SALE_REVERSAL_NO_INVENTORY",
            message: `No branch inventory record found for product ${detail.productId} in branch ${sale.branchId}. Cannot restore stock.`,
          });
        }

        const targetLot = lots[0];

        await tx.branchInventory.update({
          where: { id: targetLot.id },
          data: { quantity: { increment: detail.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: detail.productId,
            branchId: sale.branchId,
            originBranchId: null,
            userId: currentUser.id,
            movementType: "ENTRY",
            quantity: detail.quantity,
            observation: `Reversal of sale ${sale.saleNumber}: ${reason}`,
            saleId: sale.id,
            purchaseId: null,
          },
        });
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "REVERSED",
          reversalReason: reason,
          reversedAt: new Date(),
        },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "REVERSE",
          entity: "SALE",
          entityId: sale.id,
          oldData: {
            status: "COMPLETED",
          },
          newData: {
            saleNumber: sale.saleNumber,
            status: "REVERSED",
            reason,
            restoredItems: sale.details.map((d) => ({
              productId: d.productId,
              quantity: d.quantity,
            })),
          },
          reason,
          ipAddress,
        },
        tx,
      );
      const updatedSale = await tx.sale.findUnique({
        where: { id: sale.id },
        select: saleSelect,
      });

      if (!updatedSale) {
        throw new NotFoundException({
          code: "SALE_NOT_FOUND",
          message: "Sale not found.",
        });
      }

      return formatSaleResponse(updatedSale);
    });
  }

  private async generateSaleNumber(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    branchId: string,
    now: Date,
  ): Promise<string> {
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `V-${dateStr}-`;

    const lastSale = await tx.sale.findFirst({
      where: { branchId, saleNumber: { startsWith: prefix } },
      orderBy: { saleNumber: "desc" },
      select: { saleNumber: true },
    });

    let seq = 1;
    if (lastSale) {
      const lastSeq = parseInt(lastSale.saleNumber.slice(-4), 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(4, "0")}`;
  }

  private assertBranchScope(branchId: string, currentUser: AuthenticatedUser) {
    const roleName = currentUser.role?.name;
    if (roleName === "SUPERADMIN") return;

    if (roleName === "BRANCH_LEADER" || roleName === "BRANCH_ASSISTANT") {
      const branches = currentUser.branches ?? [];
      const hasAccess = branches.some((branch) => branch.id === branchId);
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
