import { jest, describe, beforeEach, it, expect } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const prismaMock = {
  auditLog: {
    create: jest.fn<AsyncMock>(),
    count: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
  },
  $transaction: jest.fn<(operations: Promise<unknown>[]) => Promise<unknown>>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("./audit.service.js");

describe("AuditService", () => {
  let service: InstanceType<typeof AuditService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      (operations: Promise<unknown>[]) => Promise.all(operations),
    );
    prismaMock.auditLog.count.mockResolvedValue(1);
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: 15n,
        userId: "actor-id",
        action: "UPDATE",
        entity: "USER",
        entityId: "target-id",
        oldData: null,
        newData: { active: false },
        reason: "Desactivación de cuenta",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-09-28T10:00:00.000Z"),
        userAccount: {
          person: {
            id: "actor-id",
            firstName: "Laura",
            lastName: "Pérez",
            businessName: null,
            email: "laura@example.com",
          },
        },
      },
    ]);

    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  it("filters by executor, action, entity, entity id and date range", async () => {
    const result = await service.findAll({
      page: 2,
      limit: 5,
      userId: "actor-id",
      action: "UPDATE",
      entity: "product",
      entityId: "target-id",
      from: "2026-09-01",
      to: "2026-09-28",
    });

    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({
      where: {
        userId: "actor-id",
        action: "UPDATE",
        entity: { equals: "product", mode: "insensitive" },
        entityId: "target-id",
        createdAt: {
          gte: new Date("2026-09-01"),
          lte: new Date("2026-09-28T23:59:59.999Z"),
        },
      },
    });
    expect(result.data[0].id).toBe("15");
    expect(result.meta).toEqual({ page: 2, limit: 5, total: 1, totalPages: 1 });
  });

  it("keeps fromDate and toDate as aliases of from and to", async () => {
    await service.findAll({
      page: 1,
      limit: 10,
      fromDate: "2026-09-01",
      toDate: "2026-09-28",
    });

    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date("2026-09-01"),
          lte: new Date("2026-09-28T23:59:59.999Z"),
        },
      },
    });
  });

  it("returns the executor as user with id and full name", async () => {
    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data[0]).toMatchObject({
      user: { id: "actor-id", fullName: "Laura Pérez" },
      userAccount: {
        person: {
          id: "actor-id",
          firstName: "Laura",
          lastName: "Pérez",
          email: "laura@example.com",
        },
      },
    });
    expect(result.data[0].userAccount?.person).not.toHaveProperty(
      "businessName",
    );
  });

  it("falls back to the business name and then the email for the full name", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: 16n,
        userId: "company-id",
        userAccount: {
          person: {
            id: "company-id",
            firstName: null,
            lastName: null,
            businessName: "NutriMax SAS",
            email: "ventas@nutrimax.co",
          },
        },
      },
      {
        id: 17n,
        userId: "email-id",
        userAccount: {
          person: {
            id: "email-id",
            firstName: null,
            lastName: null,
            businessName: null,
            email: "solo@correo.co",
          },
        },
      },
    ]);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data.map((log) => log.user?.fullName)).toEqual([
      "NutriMax SAS",
      "solo@correo.co",
    ]);
  });

  it("rejects an inverted date range", async () => {
    await expect(
      service.findAll({
        page: 1,
        limit: 10,
        fromDate: "2026-09-29",
        toDate: "2026-09-28",
      }),
    ).rejects.toThrow("fromDate must be before or equal to toDate");
  });
});
