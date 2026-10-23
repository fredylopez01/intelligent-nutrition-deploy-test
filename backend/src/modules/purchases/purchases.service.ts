import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreatePurchaseDto } from "./dto/create-purchase.dto.js";
import { ListPurchasesQueryDto } from "./dto/list-purchases-query.dto.js";

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
      fullName: [
        purchase.user.person.firstName,
        purchase.user.person.lastName,
      ]
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

    return this.prisma.$transaction(async (tx) => {
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

      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, active: true, name: true },
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
        detailsData.reduce(
          (acc, d) => acc + Math.round(d.subtotal * 100),
          0,
        ) / 100;
      const purchaseTotal = purchaseSubtotal;

      const purchaseNumber = await this.generatePurchaseNumber(tx);

      const purchase = await tx.purchase.create({
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
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
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
    const purchase = await this.prisma.purchase.findUnique({
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

  private async generatePurchaseNumber(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
  ): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `C-${dateStr}-`;

    const lastPurchase = await tx.purchase.findFirst({
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
