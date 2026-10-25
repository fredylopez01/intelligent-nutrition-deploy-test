import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreatePurchaseDto } from "./dto/create-purchase.dto.js";
import { ListPurchasesQueryDto } from "./dto/list-purchases-query.dto.js";
import { ReceivePurchaseDto } from "./dto/receive-purchase.dto.js";

const purchaseDetailSelect = {
  id: true,
  productId: true,
  requestedQuantity: true,
  receivedQuantity: true,
  unitPrice: true,
  subtotal: true,
  received: true,
  observation: true,
  product: {
    select: {
      name: true,
      referenceCode: true,
    },
  },
};

const purchaseSelect = {
  id: true,
  purchaseNumber: true,
  status: true,
  purchaseAt: true,
  subtotal: true,
  total: true,
  observation: true,
  createdAt: true,
  updatedAt: true,
  supplier: {
    select: {
      personId: true,
      commercialName: true,
      person: {
        select: {
          businessName: true,
        },
      },
    },
  },
  user: {
    select: {
      personId: true,
      person: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  details: {
    select: purchaseDetailSelect,
  },
};

function formatPurchaseResponse(purchase: any) {
  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    status: purchase.status,
    supplier: {
      id: purchase.supplier.personId,
      commercialName: purchase.supplier.commercialName,
      businessName: purchase.supplier.person.businessName,
    },
    user: {
      id: purchase.user.personId,
      fullName: [purchase.user.person.firstName, purchase.user.person.lastName]
        .filter(Boolean)
        .join(" "),
    },
    purchaseAt: purchase.purchaseAt,
    subtotal: Number(purchase.subtotal).toFixed(2),
    total: Number(purchase.total).toFixed(2),
    observation: purchase.observation,
    items: purchase.details.map((d: any) => ({
      id: d.id,
      productId: d.productId,
      productName: d.product.name,
      referenceCode: d.product.referenceCode,
      requestedQuantity: d.requestedQuantity,
      receivedQuantity: d.receivedQuantity,
      unitPrice: Number(d.unitPrice).toFixed(2),
      subtotal: Number(d.subtotal).toFixed(2),
      received: d.received,
      observation: d.observation,
    })),
  };
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreatePurchaseDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { supplierId, observation, items } = dto;

    const productIds = items.map((i) => i.productId);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      throw new UnprocessableEntityException({
        code: "DUPLICATED_PRODUCT",
        message: "Items contain duplicated products.",
      });
    }

    return this.prisma.$transaction(async (tx: any) => {
      const supplier = await tx.supplier.findUnique({
        where: { personId: supplierId },
        select: { personId: true, active: true },
      });
      if (!supplier) {
        throw new NotFoundException({
          code: "SUPPLIER_NOT_FOUND",
          message: "Supplier not found.",
        });
      }
      if (!supplier.active) {
        throw new UnprocessableEntityException({
          code: "SUPPLIER_INACTIVE",
          message: "Supplier is inactive.",
        });
      }

      const products = await (tx as any).product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, active: true, name: true },
      });
      const productMap = new Map<string, any>(
        (products as any[]).map((p) => [p.id, p]),
      );

      for (const item of items) {
        const product: any = productMap.get(item.productId);
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

      const detailsData = items.map((item) => {
        const unitPriceCents = Math.round(parseFloat(item.unitPrice) * 100);
        const subtotalCents = unitPriceCents * item.requestedQuantity;
        return {
          productId: item.productId,
          requestedQuantity: item.requestedQuantity,
          receivedQuantity: 0,
          unitPrice: parseFloat(item.unitPrice),
          subtotal: subtotalCents / 100,
          received: false,
          observation: item.observation ?? null,
        };
      });

      const purchaseSubtotal =
        detailsData.reduce((acc, d) => acc + Math.round(d.subtotal * 100), 0) /
        100;
      const purchaseTotal = purchaseSubtotal;

      const purchaseNumber = await this.generatePurchaseNumber(tx as any);

      const purchase: any = await (tx as any).purchase.create({
        data: {
          purchaseNumber,
          supplierId,
          userId: currentUser.id,
          subtotal: purchaseSubtotal,
          total: purchaseTotal,
          observation: observation ?? null,
          details: {
            create: detailsData,
          },
        },
        select: purchaseSelect,
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "PURCHASE",
          entityId: purchase.id,
          newData: {
            purchaseNumber: purchase.purchaseNumber,
            supplierId,
            subtotal: Number(purchase.subtotal).toFixed(2),
            total: Number(purchase.total).toFixed(2),
            itemsCount: items.length,
          },
          reason: `Purchase order ${purchase.purchaseNumber} created`,
          ipAddress,
        },
        tx,
      );

      return formatPurchaseResponse(purchase);
    });
  }

  async findAll(query: ListPurchasesQueryDto) {
    const { page, limit, supplierId, status, from, to, productId, search } =
      query;

    if (search !== undefined && search.length < 2) {
      throw new BadRequestException({
        code: "SEARCH_TOO_SHORT",
        message: "Search must contain at least 2 characters.",
        details: { minLength: 2 },
      });
    }

    const where: any = {};

    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (search) {
      where.purchaseNumber = { contains: search, mode: "insensitive" };
    }
    if (from || to) {
      where.purchaseAt = {};
      if (from) where.purchaseAt.gte = new Date(`${from}T00:00:00Z`);
      if (to) where.purchaseAt.lte = new Date(`${to}T23:59:59.999Z`);
    }
    if (productId) {
      where.details = { some: { productId } };
    }

    const skip = (page - 1) * limit;

    const [total, purchases] = await this.prisma.$transaction([
      (this.prisma as any).purchase.count({ where }),
      (this.prisma as any).purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchaseAt: "desc" },
        select: {
          id: true,
          purchaseNumber: true,
          status: true,
          purchaseAt: true,
          total: true,
          supplier: {
            select: {
              personId: true,
              commercialName: true,
              person: { select: { businessName: true } },
            },
          },
          _count: { select: { details: true } },
        },
      }),
    ]);

    return {
      data: purchases.map((p) => ({
        id: p.id,
        purchaseNumber: p.purchaseNumber,
        status: p.status,
        supplier: {
          id: p.supplier.personId,
          commercialName: p.supplier.commercialName,
          businessName: p.supplier.person.businessName,
        },
        total: Number(p.total).toFixed(2),
        purchaseAt: p.purchaseAt,
        itemsCount: p._count.details,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(purchaseId: string) {
    const purchase: any = await (this.prisma as any).purchase.findUnique({
      where: { id: purchaseId },
      select: purchaseSelect,
    });

    if (!purchase) {
      throw new NotFoundException({
        code: "PURCHASE_NOT_FOUND",
        message: "Purchase not found.",
      });
    }

    return formatPurchaseResponse(purchase);
  }

  async receive(
    purchaseId: string,
    dto: ReceivePurchaseDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { items } = dto;

    const detailIds = items.map((i) => i.purchaseDetailId);
    const uniqueDetailIds = new Set(detailIds);
    if (uniqueDetailIds.size !== detailIds.length) {
      throw new UnprocessableEntityException({
        code: "DUPLICATED_PURCHASE_DETAIL",
        message: "Items contain duplicated purchase details.",
      });
    }

    return this.prisma.$transaction(async (tx: any) => {
      const purchase: any = await (tx as any).purchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          purchaseNumber: true,
          status: true,
          supplierId: true,
          subtotal: true,
          total: true,
          observation: true,
          purchaseAt: true,
          createdAt: true,
          updatedAt: true,
          details: {
            select: {
              id: true,
              productId: true,
              requestedQuantity: true,
              receivedQuantity: true,
              unitPrice: true,
              subtotal: true,
              received: true,
              observation: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  referenceCode: true,
                },
              },
            },
          },
          supplier: {
            select: {
              personId: true,
              commercialName: true,
              person: { select: { businessName: true } },
            },
          },
          user: {
            select: {
              personId: true,
              person: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!purchase) {
        throw new NotFoundException({
          code: "PURCHASE_NOT_FOUND",
          message: "Purchase not found.",
        });
      }

      if (purchase.status === "FULLY_RECEIVED") {
        throw new ConflictException({
          code: "PURCHASE_ALREADY_RECEIVED",
          message: "Purchase is already fully received.",
        });
      }

      const detailMap = new Map<string, any>(
        (purchase.details as any[]).map((d) => [d.id, d]),
      );
      const receivedNowByDetail = new Map<string, number>();
      const observationsByDetail = new Map<string, string | undefined>();

      for (const item of items) {
        const detail: any = detailMap.get(item.purchaseDetailId);
        if (!detail) {
          throw new NotFoundException({
            code: "PURCHASE_DETAIL_NOT_FOUND",
            message: `Purchase detail ${item.purchaseDetailId} not found.`,
          });
        }

        const newAccumulated = detail.receivedQuantity + item.receivedQuantity;
        if (newAccumulated > detail.requestedQuantity) {
          throw new UnprocessableEntityException({
            code: "RECEIVED_EXCEEDS_REQUESTED",
            message: "Received quantity exceeds requested quantity.",
          });
        }

        receivedNowByDetail.set(detail.id, item.receivedQuantity);
        observationsByDetail.set(detail.id, item.observation);
      }

      const movementsData: Array<{
        productId: string;
        quantity: number;
        purchaseDetailId: string;
      }> = [];

      for (const detail of purchase.details as any[]) {
        const receivedNow = receivedNowByDetail.get(detail.id) ?? 0;
        if (receivedNow === 0) {
          continue;
        }

        const newReceivedQuantity = detail.receivedQuantity + receivedNow;
        const isComplete = newReceivedQuantity === detail.requestedQuantity;
        const itemObservation = observationsByDetail.get(detail.id);

        await (tx as any).purchaseDetail.update({
          where: { id: detail.id },
          data: {
            receivedQuantity: newReceivedQuantity,
            received: isComplete,
            ...(itemObservation !== undefined
              ? { observation: itemObservation }
              : {}),
          },
        });

        movementsData.push({
          productId: detail.productId,
          quantity: receivedNow,
          purchaseDetailId: detail.id,
        });

        await (tx as any).inventoryMovement.create({
          data: {
            productId: detail.productId,
            branchId: null,
            originBranchId: null,
            userId: currentUser.id,
            movementType: "ENTRY",
            quantity: receivedNow,
            observation: itemObservation ?? null,
            purchaseId,
          },
        });
      }

      const updatedDetails: any[] = await (tx as any).purchaseDetail.findMany({
        where: { purchaseId },
        select: { receivedQuantity: true, requestedQuantity: true },
      });

      const allComplete = updatedDetails.every(
        (d: any) => d.receivedQuantity === d.requestedQuantity,
      );

      await (tx as any).purchase.update({
        where: { id: purchaseId },
        data: {
          status: allComplete ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED",
        },
      });

      const fullPurchase: any = await (tx as any).purchase.findUnique({
        where: { id: purchaseId },
        select: purchaseSelect,
      });

      if (!fullPurchase) {
        throw new NotFoundException({
          code: "PURCHASE_NOT_FOUND",
          message: "Purchase not found.",
        });
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "RECEIVE",
          entity: "PURCHASE",
          entityId: purchaseId,
          newData: {
            purchaseNumber: purchase.purchaseNumber,
            status: fullPurchase.status,
            receivedNow: movementsData,
          },
          reason: `Purchase order ${purchase.purchaseNumber} receipt registered`,
          ipAddress,
        },
        tx,
      );

      return formatPurchaseResponse(fullPurchase);
    });
  }

  private async generatePurchaseNumber(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
  ): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `C-${dateStr}-`;

    const lastPurchase: any = await (tx as any).purchase.findFirst({
      where: { purchaseNumber: { startsWith: prefix } },
      orderBy: { purchaseNumber: "desc" },
      select: { purchaseNumber: true },
    });

    let seq = 1;
    if (lastPurchase) {
      const lastSeq = parseInt(lastPurchase.purchaseNumber.slice(-4), 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(4, "0")}`;
  }
}
