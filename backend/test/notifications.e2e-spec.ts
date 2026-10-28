import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const runId = Date.now().toString(36);
const codePrefix = runId.toUpperCase();

describe("Notifications (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  const people: string[] = [];
  let leaderId: string;
  let otherId: string;
  let leaderToken: string;
  let otherToken: string;
  let otherNotificationId: string;
  const leaderNotifications: string[] = [];

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const jwtService = app.get(JwtService);

    documentTypeId = (
      await prisma.documentType.upsert({
        where: { code: `NTF-${codePrefix}` },
        update: { active: true },
        create: {
          code: `NTF-${codePrefix}`,
          name: "Cédula (e2e notificaciones)",
        },
      })
    ).id;
    const role = await prisma.role.upsert({
      where: { name: "BRANCH_LEADER" },
      update: { active: true },
      create: { name: "BRANCH_LEADER" },
    });

    for (const [index, name] of ["Leader", "Other"].entries()) {
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${codePrefix}${index}`,
          firstName: name,
          lastName: "E2E",
          email: `${name.toLowerCase()}.notifications.${runId}@e2e.test`,
          phone: "3009998877",
          address: "Carrera 9 # 8-7",
          userAccount: {
            create: {
              roleId: role.id,
              active: true,
              mustChangePassword: false,
            },
          },
        },
      });
      people.push(person.id);
    }
    [leaderId, otherId] = people;
    leaderToken = await jwtService.signAsync({ sub: leaderId });
    otherToken = await jwtService.signAsync({ sub: otherId });

    const base = Date.now();
    const seeds: Array<[string, string, boolean]> = [
      ["LOW_STOCK", "Inventario bajo", false],
      ["CLOSURE_NOT_CONFIRMED", "Cierre no confirmado", false],
      ["LOW_STOCK", "Inventario bajo leído", true],
    ];
    for (const [index, [type, title, read]] of seeds.entries()) {
      const created = await prisma.notification.create({
        data: {
          userId: leaderId,
          type: type as "LOW_STOCK" | "CLOSURE_NOT_CONFIRMED",
          title,
          message: `${title} ${runId}`,
          read,
          createdAt: new Date(base - index * 60_000),
        },
      });
      leaderNotifications.push(created.id);
    }
    otherNotificationId = (
      await prisma.notification.create({
        data: {
          userId: otherId,
          type: "LOW_STOCK",
          title: "Ajena",
          message: "Ajena",
        },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma?.notification.deleteMany({
        where: { userId: { in: people } },
      });
      await prisma?.userAccount.deleteMany({
        where: { personId: { in: people } },
      });
      await prisma?.person.deleteMany({ where: { id: { in: people } } });
      await prisma?.documentType.deleteMany({ where: { id: documentTypeId } });
    } finally {
      await app?.close();
    }
  });

  it("lists only my notifications, newest first", async () => {
    const response = await http()
      .get("/api/v1/notifications")
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(200);
    const body = response.body as {
      data: NotificationItem[];
      meta: { total: number };
    };

    expect(body.data.map((item) => item.id)).toEqual(leaderNotifications);
    expect(body.meta.total).toBe(3);
  });

  it("paginates my notifications and reports pagination metadata", async () => {
    const firstPage = await http()
      .get("/api/v1/notifications")
      .query({ page: 1, limit: 2 })
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(200);
    const firstPageBody = firstPage.body as {
      data: NotificationItem[];
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    };

    expect(firstPageBody.data.map(({ id }) => id)).toEqual(
      leaderNotifications.slice(0, 2),
    );
    expect(firstPageBody.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });

    const secondPage = await http()
      .get("/api/v1/notifications")
      .query({ page: 2, limit: 2 })
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(200);
    expect(
      (secondPage.body as { data: NotificationItem[] }).data.map(
        ({ id }) => id,
      ),
    ).toEqual(leaderNotifications.slice(2));
  });

  it("filters by read state and type", async () => {
    const unread = await http()
      .get("/api/v1/notifications")
      .query({ read: "false", type: "LOW_STOCK" })
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(200);

    expect(
      (unread.body as { data: NotificationItem[] }).data.map((item) => item.id),
    ).toEqual([leaderNotifications[0]]);
  });

  it("filters read notifications separately from unread notifications", async () => {
    const [unread, read] = await Promise.all([
      http()
        .get("/api/v1/notifications")
        .query({ read: "false" })
        .set("Authorization", `Bearer ${leaderToken}`)
        .expect(200),
      http()
        .get("/api/v1/notifications")
        .query({ read: "true" })
        .set("Authorization", `Bearer ${leaderToken}`)
        .expect(200),
    ]);

    expect(
      (unread.body as { data: NotificationItem[] }).data.map(({ id }) => id),
    ).toEqual(leaderNotifications.slice(0, 2));
    expect(
      (read.body as { data: NotificationItem[] }).data.map(({ id }) => id),
    ).toEqual([leaderNotifications[2]]);
  });

  it("rejects an unknown type", async () => {
    await http()
      .get("/api/v1/notifications")
      .query({ type: "SOMETHING" })
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(400);
  });

  it("counts my unread notifications", async () => {
    const response = await http()
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(200);

    expect(response.body).toEqual({ data: { unread: 2 } });
  });

  it("marks a notification as read and stays idempotent", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await http()
        .patch(`/api/v1/notifications/${leaderNotifications[0]}/read`)
        .set("Authorization", `Bearer ${leaderToken}`)
        .expect(200);
      expect((response.body as { data: NotificationItem }).data).toMatchObject({
        id: leaderNotifications[0],
        read: true,
      });
    }
  });

  it("answers 404 for a notification of another user", async () => {
    await http()
      .patch(`/api/v1/notifications/${otherNotificationId}/read`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(404);

    const stored = await prisma.notification.findUnique({
      where: { id: otherNotificationId },
    });
    expect(stored?.read).toBe(false);
  });

  it("marks all my notifications as read without touching others", async () => {
    const response = await http()
      .post("/api/v1/notifications/read-all")
      .set("Authorization", `Bearer ${leaderToken}`)
      .expect(200);

    expect(response.body).toEqual({ data: { updated: 1 } });
    const count = await http()
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(200);
    expect(count.body).toEqual({ data: { unread: 1 } });
  });

  it("requires authentication", async () => {
    await http().get("/api/v1/notifications").expect(401);
  });

  it("requires authentication to mark a notification as read", async () => {
    await http()
      .patch(`/api/v1/notifications/${leaderNotifications[0]}/read`)
      .expect(401);
  });
});
