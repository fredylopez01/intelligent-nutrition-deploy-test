import { jest, describe, beforeEach, it, expect } from "@jest/globals";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const prismaMock = {
  branch: {
    findUnique: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
  },
  $transaction:
    jest.fn<
      (operation: (client: unknown) => Promise<unknown>) => Promise<unknown>
    >(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { ConflictException } = await import("@nestjs/common");
const { BranchesService } = await import("./branches.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

const currentUser = {
  id: "admin-person-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

const branchSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  active: true,
};

const createBranchDto = {
  name: "Sede Centro",
  address: "Carrera 10 # 20-30",
  phone: "6017000000",
};

const branchRecord = {
  id: "branch-uuid-1",
  ...createBranchDto,
  active: true,
};

describe("BranchesService.create", () => {
  let service: InstanceType<typeof BranchesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(prismaMock),
    );
    prismaMock.branch.findUnique.mockResolvedValue(null);
    prismaMock.branch.create.mockResolvedValue(branchRecord);
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(BranchesService);
  });

  it("creates the branch and returns its public fields", async () => {
    const result = await service.create(
      createBranchDto,
      currentUser,
      "127.0.0.1",
    );

    expect(prismaMock.branch.findUnique).toHaveBeenCalledWith({
      where: { name: "Sede Centro" },
      select: { id: true },
    });
    expect(prismaMock.branch.create).toHaveBeenCalledWith({
      data: createBranchDto,
      select: branchSelect,
    });
    expect(result).toEqual(branchRecord);
  });

  it("records the creation in the audit log inside the same transaction", async () => {
    await service.create(createBranchDto, currentUser, "127.0.0.1");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      {
        userId: "admin-person-id",
        action: "CREATE",
        entity: "BRANCH",
        entityId: "branch-uuid-1",
        newData: branchRecord,
        reason: "Creación de la sede Sede Centro",
        ipAddress: "127.0.0.1",
      },
      prismaMock,
    );
  });

  it("rejects a duplicated name without creating the branch", async () => {
    prismaMock.branch.findUnique.mockResolvedValue({ id: "branch-uuid-2" });

    await expect(
      service.create(createBranchDto, currentUser, "127.0.0.1"),
    ).rejects.toThrow(new ConflictException("Branch name already exists"));

    expect(prismaMock.branch.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("maps a unique constraint violation to a duplicated name conflict", async () => {
    prismaMock.branch.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create(createBranchDto, currentUser, "127.0.0.1"),
    ).rejects.toThrow(new ConflictException("Branch name already exists"));

    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("propagates unexpected database errors", async () => {
    const databaseError = new Error("connection lost");
    prismaMock.branch.create.mockRejectedValue(databaseError);

    await expect(
      service.create(createBranchDto, currentUser, "127.0.0.1"),
    ).rejects.toBe(databaseError);
  });
});
