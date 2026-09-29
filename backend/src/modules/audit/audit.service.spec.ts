import { jest, describe, beforeEach, it, expect } from "@jest/globals";

const prismaMock: any = {
  auditLog: {
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
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
        userAccount: { person: { id: "actor-id" } },
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

  it("filters by affected user, action, and date range", async () => {
    const result = await service.findAll({
      page: 2,
      limit: 5,
      userId: "target-id",
      action: "UPDATE",
      fromDate: "2026-09-01",
      toDate: "2026-09-28",
    });

    expect(prismaMock.auditLog.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        entity: "USER",
        entityId: "target-id",
        action: "UPDATE",
        createdAt: {
          gte: new Date("2026-09-01"),
          lte: new Date("2026-09-28T23:59:59.999Z"),
        },
      }),
    });
    expect(result.data[0].id).toBe("15");
    expect(result.meta).toEqual({ page: 2, limit: 5, total: 1, totalPages: 1 });
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
