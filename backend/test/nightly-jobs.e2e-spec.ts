import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { Test } from "@nestjs/testing";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";
import { NightlyJobsService } from "../src/modules/nightly-jobs/nightly-jobs.service.js";

const runId = Date.now().toString(36);
const codePrefix = runId.toUpperCase();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("Nightly jobs (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jobs: NightlyJobsService;
  let documentTypeId: string;
  let branchId: string;
  let leaderId: string;
  let supplierId: string;
  const closureIds: Record<string, string> = {};
  const purchaseIds: Record<string, string> = {};
  const branchName = `Sede nocturna ${runId}`;
  const now = new Date();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    jobs = app.get(NightlyJobsService);

    documentTypeId = (
      await prisma.documentType.upsert({
        where: { code: `NGT-${codePrefix}` },
        update: { active: true },
        create: { code: `NGT-${codePrefix}`, name: "Cédula (e2e nocturno)" },
      })
    ).id;
    const leaderRole = await prisma.role.upsert({
      where: { name: "BRANCH_LEADER" },
      update: { active: true },
      create: { name: "BRANCH_LEADER" },
    });
    branchId = (
      await prisma.branch.create({
        data: {
          name: branchName,
          address: "Calle 1 # 2-3",
          phone: "3001112233",
        },
      })
    ).id;
    leaderId = (
      await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${codePrefix}L`,
          firstName: "Leader",
          lastName: "Nocturno",
          email: `leader.nightly.${runId}@e2e.test`,
          phone: "3009998877",
          address: "Carrera 9 # 8-7",
          userAccount: {
            create: {
              roleId: leaderRole.id,
              active: true,
              mustChangePassword: false,
              branchAssignments: {
                create: {
                  branchId,
                  assignmentDate: new Date(now.getTime() - 30 * DAY_MS),
                },
              },
            },
          },
        },
      })
    ).id;
    supplierId = (
      await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${codePrefix}S`,
          businessName: "Proveedor Nocturno SAS",
          email: `supplier.nightly.${runId}@e2e.test`,
          phone: "3007776655",
          address: "Calle 5 # 6-7",
          supplier: { create: { commercialName: `NutriNoche ${runId}` } },
        },
      })
    ).id;

    const closureSeeds: Array<
      [string, number, "PENDING" | "CONFIRMED", number]
    > = [
      ["yesterday", 1, "PENDING", 1],
      ["older", 2, "PENDING", 2],
      ["confirmed", 3, "CONFIRMED", 3],
      ["today", 0, "PENDING", 0],
    ];
    for (const [key, daysAgo, status, dateOffset] of closureSeeds) {
      const createdAt = new Date(now.getTime() - daysAgo * DAY_MS);
      const closureDate = new Date(Date.UTC(2020, 0, 1 + dateOffset));
      closureIds[key] = (
        await prisma.inventoryClosure.create({
          data: {
            branchId,
            userId: leaderId,
            closureDate,
            status,
            confirmed: status === "CONFIRMED",
            locked: status === "CONFIRMED",
            createdAt,
          },
        })
      ).id;
    }

    const purchaseSeeds: Array<
      [
        string,
        number,
        "PENDING_RECEIPT" | "PARTIALLY_RECEIVED" | "FULLY_RECEIVED",
      ]
    > = [
      ["due", 7.5, "PENDING_RECEIPT"],
      ["partial", 7.2, "PARTIALLY_RECEIVED"],
      ["received", 7.5, "FULLY_RECEIVED"],
      ["recent", 3, "PENDING_RECEIPT"],
      ["remindedBefore", 9, "PENDING_RECEIPT"],
    ];
    for (const [key, daysAgo, status] of purchaseSeeds) {
      purchaseIds[key] = (
        await prisma.purchase.create({
          data: {
            purchaseNumber: `NGT-${codePrefix}-${key}`,
            supplierId,
            userId: leaderId,
            purchaseAt: new Date(now.getTime() - daysAgo * DAY_MS),
            subtotal: 0,
            total: 0,
            status,
          },
        })
      ).id;
    }
  });

  afterAll(async () => {
    try {
      await prisma?.notification.deleteMany({
        where: {
          OR: [
            { branchId },
            { userId: leaderId },
            { message: { contains: `NGT-${codePrefix}` } },
          ],
        },
      });
      await prisma?.purchase.deleteMany({ where: { supplierId } });
      await prisma?.inventoryClosure.deleteMany({ where: { branchId } });
      await prisma?.userBranch.deleteMany({ where: { branchId } });
      await prisma?.supplier.deleteMany({ where: { personId: supplierId } });
      await prisma?.userAccount.deleteMany({ where: { personId: leaderId } });
      await prisma?.person.deleteMany({
        where: { id: { in: [leaderId, supplierId] } },
      });
      await prisma?.branch.deleteMany({ where: { id: branchId } });
      await prisma?.documentType.deleteMany({ where: { id: documentTypeId } });
    } finally {
      await app?.close();
    }
  });

  it("registers the nightly cron at midnight Bogota time", () => {
    const job = app.get(SchedulerRegistry).getCronJob("nightly-jobs");
    const next = job.nextDate().setZone("America/Bogota");
    expect(next.hour).toBe(0);
    expect(next.minute).toBe(0);
  });

  it("locks the closures left pending from previous days and notifies the leader", async () => {
    await jobs.lockPendingClosures(now);

    const closures = await prisma.inventoryClosure.findMany({
      where: { branchId },
      select: { id: true, status: true, locked: true, closedAt: true },
    });
    const byId = new Map(closures.map((closure) => [closure.id, closure]));

    for (const key of ["yesterday", "older"]) {
      const closure = byId.get(closureIds[key]);
      expect(closure?.status).toBe("NOT_CONFIRMED");
      expect(closure?.locked).toBe(true);
      expect(closure?.closedAt).not.toBeNull();
    }
    expect(byId.get(closureIds.confirmed)?.status).toBe("CONFIRMED");
    expect(byId.get(closureIds.today)).toMatchObject({
      status: "PENDING",
      locked: false,
    });

    const notifications = await prisma.notification.findMany({
      where: { userId: leaderId, type: "CLOSURE_NOT_CONFIRMED" },
    });
    expect(notifications).toHaveLength(2);
    expect(notifications.every((n) => n.branchId === branchId)).toBe(true);
    expect(notifications[0].message).toContain(branchName);
  });

  it("does not lock or notify twice when it runs again", async () => {
    expect(await jobs.lockPendingClosures(now)).toBeGreaterThanOrEqual(0);

    expect(
      await prisma.notification.count({
        where: { userId: leaderId, type: "CLOSURE_NOT_CONFIRMED" },
      }),
    ).toBe(2);
  });

  it("reminds the superadmins about purchases that reached 7 days without full receipt", async () => {
    const superadmins = await prisma.userAccount.count({
      where: {
        active: true,
        person: { active: true },
        role: { name: "SUPERADMIN" },
      },
    });

    await jobs.remindPendingPurchases(now);

    const notifications = await prisma.notification.findMany({
      where: {
        type: "PURCHASE_PENDING_RECEIPT",
        message: { contains: `NGT-${codePrefix}` },
      },
    });
    const numbers = new Set(notifications.map((n) => n.message.split(" ")[2]));
    expect(numbers).toEqual(
      superadmins > 0
        ? new Set([`NGT-${codePrefix}-due`, `NGT-${codePrefix}-partial`])
        : new Set(),
    );
    expect(notifications).toHaveLength(superadmins * 2);
    expect(notifications.every((n) => n.userId !== leaderId)).toBe(true);
  });
});
