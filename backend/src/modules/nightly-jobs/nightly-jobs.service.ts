import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { NotificationWriterService } from "../notifications/notification-writer.service.js";
import {
  BUSINESS_TIME_ZONE,
  startOfBusinessDay,
} from "../../common/utils/business-day.util.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const PURCHASE_REMINDER_DAYS = 7;

export interface NightlyRunResult {
  lockedClosures: number;
  purchaseReminders: number;
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class NightlyJobsService {
  private readonly logger = new Logger(NightlyJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: NotificationWriterService,
  ) {}

  @Cron("0 0 * * *", {
    name: "nightly-jobs",
    timeZone: BUSINESS_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    try {
      const result = await this.run();
      this.logger.log(
        `Nightly jobs done: ${result.lockedClosures} closures locked, ${result.purchaseReminders} purchase reminders.`,
      );
    } catch (error) {
      this.logger.error("Nightly jobs failed", error as Error);
    }
  }

  async run(now = new Date()): Promise<NightlyRunResult> {
    const lockedClosures = await this.lockPendingClosures(now);
    const purchaseReminders = await this.remindPendingPurchases(now);
    return { lockedClosures, purchaseReminders };
  }

  async lockPendingClosures(now = new Date()): Promise<number> {
    const dayStart = startOfBusinessDay(now);
    const pending = await this.prisma.inventoryClosure.findMany({
      where: { status: "PENDING", createdAt: { lt: dayStart } },
      select: {
        id: true,
        branchId: true,
        closureDate: true,
        branch: { select: { name: true } },
        details: { select: { physicalQuantity: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    let locked = 0;
    for (const closure of pending) {
      const done = await this.prisma.$transaction(async (tx) => {
        const result = await tx.inventoryClosure.updateMany({
          where: { id: closure.id, status: "PENDING" },
          data: {
            status: "NOT_CONFIRMED",
            confirmed: false,
            locked: true,
            closedAt: now,
          },
        });
        if (result.count === 0) return false;

        const counted = closure.details.filter(
          (detail) => detail.physicalQuantity !== null,
        ).length;
        const recipients = await this.writer.branchManagerIds(
          tx,
          closure.branchId,
        );
        await this.writer.createForUsers(tx, recipients, {
          type: "CLOSURE_NOT_CONFIRMED",
          title: "Cierre sin confirmar",
          message: `El cierre del ${formatDay(closure.closureDate)} en ${closure.branch.name} no se confirmó y quedó bloqueado (${counted} de ${closure.details.length} conteos registrados).`,
          branchId: closure.branchId,
        });
        return true;
      });
      if (done) locked += 1;
    }
    return locked;
  }

  async remindPendingPurchases(now = new Date()): Promise<number> {
    const windowEnd = new Date(now.getTime() - PURCHASE_REMINDER_DAYS * DAY_MS);
    const windowStart = new Date(windowEnd.getTime() - DAY_MS);
    const purchases = await this.prisma.purchase.findMany({
      where: {
        status: { in: ["PENDING_RECEIPT", "PARTIALLY_RECEIVED"] },
        purchaseAt: { gte: windowStart, lt: windowEnd },
      },
      select: {
        id: true,
        purchaseNumber: true,
        status: true,
        supplier: {
          select: {
            commercialName: true,
            person: {
              select: { businessName: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { purchaseAt: "asc" },
    });
    if (purchases.length === 0) return 0;

    return this.prisma.$transaction(async (tx) => {
      const recipients = await this.writer.superadminIds(tx);
      let reminded = 0;
      for (const purchase of purchases) {
        const person = purchase.supplier.person;
        const supplierName =
          purchase.supplier.commercialName ??
          person.businessName ??
          [person.firstName, person.lastName].filter(Boolean).join(" ");
        const pending =
          purchase.status === "PARTIALLY_RECEIVED"
            ? "sigue recibida solo en parte"
            : "sigue sin recibirse";
        const created = await this.writer.createForUsers(tx, recipients, {
          type: "PURCHASE_PENDING_RECEIPT",
          title: "Compra pendiente de recepción",
          message: `La compra ${purchase.purchaseNumber} a ${supplierName} ${pending} después de ${PURCHASE_REMINDER_DAYS} días.`,
        });
        if (created > 0) reminded += 1;
      }
      return reminded;
    });
  }
}
