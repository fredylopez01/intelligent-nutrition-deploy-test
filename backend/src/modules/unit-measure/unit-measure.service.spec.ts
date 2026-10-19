import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;

interface UnitRecord {
  id: string;
  name: string;
  abreviation: string;
  active: boolean;
}

const prismaMock = {
  unitMeasure: {
    findUnique: jest.fn<AsyncMock>(),
    findFirst: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  $transaction:
    jest.fn<
      (
        operation: TransactionOperation | Array<Promise<unknown>>,
      ) => Promise<unknown>
    >(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { UnitMeasureService } = await import("./unit-measure.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const unitId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const currentUser: AuthenticatedUser = {
  id: "admin-user-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

function buildUnit(overrides: Partial<UnitRecord> = {}): UnitRecord {
  return {
    id: unitId,
    name: "Kilogramo",
    abreviation: "kg",
    active: true,
    ...overrides,
  };
}

describe("UnitMeasureService > update", () => {
  let service: InstanceType<typeof UnitMeasureService>;

  const existing = buildUnit();

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
    );
    prismaMock.unitMeasure.findUnique.mockResolvedValue(existing);
    prismaMock.unitMeasure.findFirst.mockResolvedValue(null);
    prismaMock.unitMeasure.update.mockResolvedValue(buildUnit());
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        UnitMeasureService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(UnitMeasureService);
  });

  it("updates the name and records the audit log", async () => {
    const updated = buildUnit({ name: "Kilogramo Premium" });
    prismaMock.unitMeasure.update.mockResolvedValue(updated);

    const result: unknown = await service.update(
      unitId,
      { name: "Kilogramo Premium" },
      currentUser,
      "127.0.0.1",
    );

    expect(prismaMock.unitMeasure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: unitId },
        data: { name: "Kilogramo Premium" },
        select: { id: true, name: true, abreviation: true, active: true },
      }),
    );
    expect(result).toBe(updated);
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      {
        userId: "admin-user-id",
        action: "UPDATE",
        entity: "UNIT_MEASURE",
        entityId: unitId,
        oldData: existing,
        newData: updated,
        reason: "Actualización de la unidad de medida Kilogramo Premium",
        ipAddress: "127.0.0.1",
      },
      prismaMock,
    );
  });

  it("updates the abreviation and records the audit log", async () => {
    const updated = buildUnit({ abreviation: "KGR" });
    prismaMock.unitMeasure.update.mockResolvedValue(updated);

    const result: unknown = await service.update(
      unitId,
      { abreviation: "KGR" },
      currentUser,
    );

    expect(prismaMock.unitMeasure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: unitId },
        data: { abreviation: "KGR" },
        select: { id: true, name: true, abreviation: true, active: true },
      }),
    );
    expect(result).toBe(updated);
    expect(auditMock.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it("updates both fields and records the audit log", async () => {
    const updated = buildUnit({ name: "Kilogramo Plus", abreviation: "KGP" });
    prismaMock.unitMeasure.update.mockResolvedValue(updated);

    await service.update(
      unitId,
      { name: "Kilogramo Plus", abreviation: "KGP" },
      currentUser,
    );

    expect(prismaMock.unitMeasure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Kilogramo Plus", abreviation: "KGP" },
      }),
    );
    expect(auditMock.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it("sends only the name when only the name is provided", async () => {
    await service.update(unitId, { name: "Gramo" }, currentUser);

    const [call] = prismaMock.unitMeasure.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(call.data).toEqual({ name: "Gramo" });
    expect(call.data).not.toHaveProperty("abreviation");
  });

  it("sends only the abreviation when only the abreviation is provided", async () => {
    await service.update(unitId, { abreviation: "KGR" }, currentUser);

    const [call] = prismaMock.unitMeasure.update.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(call.data).toEqual({ abreviation: "KGR" });
    expect(call.data).not.toHaveProperty("name");
  });

  it("rejects an empty update DTO", async () => {
    await expect(service.update(unitId, {}, currentUser)).rejects.toMatchObject(
      {
        status: 400,
        message: "At least one field must be provided",
      },
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns not found for a missing unit", async () => {
    prismaMock.unitMeasure.findUnique.mockResolvedValue(null);

    await expect(
      service.update(unitId, { name: "Gramo" }, currentUser),
    ).rejects.toMatchObject({ status: 404, message: "Unit measure not found" });
    expect(prismaMock.unitMeasure.update).not.toHaveBeenCalled();
  });

  it("does not check for conflicts when the name is unchanged", async () => {
    await service.update(unitId, { name: "Kilogramo" }, currentUser);

    expect(prismaMock.unitMeasure.findFirst).not.toHaveBeenCalled();
  });

  it("does not check for conflicts when only the abreviation changes", async () => {
    await service.update(unitId, { abreviation: "KGR" }, currentUser);

    expect(prismaMock.unitMeasure.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a new name that is already taken", async () => {
    prismaMock.unitMeasure.findFirst.mockResolvedValue(
      buildUnit({ id: otherId, name: "Gramo", abreviation: "g" }),
    );

    await expect(
      service.update(unitId, { name: "Gramo" }, currentUser),
    ).rejects.toMatchObject({
      status: 409,
      message: "Unit measure name already exists",
    });
    expect(prismaMock.unitMeasure.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a new abreviation that is already taken when changing the name", async () => {
    prismaMock.unitMeasure.findFirst.mockResolvedValue(
      buildUnit({ id: otherId, name: "Otro nombre", abreviation: "g" }),
    );

    await expect(
      service.update(
        unitId,
        { name: "Nuevo nombre", abreviation: "g" },
        currentUser,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Unit measure abreviation already exists",
    });
    expect(prismaMock.unitMeasure.update).not.toHaveBeenCalled();
  });

  it("checks name and abreviation together against existing units", async () => {
    await service.update(
      unitId,
      { name: "Gramo", abreviation: "g" },
      currentUser,
    );

    expect(prismaMock.unitMeasure.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ name: "Gramo" }, { abreviation: "g" }] },
      select: { id: true, name: true, abreviation: true },
    });
  });

  it("reads, writes and audits with the transaction client", async () => {
    const updated = buildUnit({ name: "Gramo" });
    const transactionClient = {
      unitMeasure: {
        findUnique: jest.fn<AsyncMock>().mockResolvedValue(existing),
        findFirst: jest.fn<AsyncMock>().mockResolvedValue(null),
        update: jest.fn<AsyncMock>().mockResolvedValue(updated),
      },
    };
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : operation(transactionClient),
    );

    await service.update(unitId, { name: "Gramo" }, currentUser);

    expect(transactionClient.unitMeasure.findUnique).toHaveBeenCalledTimes(1);
    expect(transactionClient.unitMeasure.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.unitMeasure.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.unitMeasure.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityId: unitId }),
      transactionClient,
    );
  });

  it("maps a P2002 unique constraint violation to a conflict", async () => {
    prismaMock.unitMeasure.update.mockRejectedValue({ code: "P2002" });

    await expect(
      service.update(unitId, { name: "Gramo" }, currentUser),
    ).rejects.toMatchObject({ status: 409 });
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("does not hide unexpected database errors", async () => {
    prismaMock.unitMeasure.update.mockRejectedValue(
      new Error("connection lost"),
    );

    await expect(
      service.update(unitId, { name: "Gramo" }, currentUser),
    ).rejects.toThrow("connection lost");
  });

  it("fails the update when the audit log cannot be written", async () => {
    prismaMock.unitMeasure.update.mockResolvedValue(
      buildUnit({ name: "Gramo" }),
    );
    auditMock.createAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(
      service.update(unitId, { name: "Gramo" }, currentUser),
    ).rejects.toThrow("audit down");
  });

  // Known defect: the audit condition requires BOTH fields to differ from the
  // stored values. When the name changes but the abreviation is resent unchanged,
  // `existingUnitMeasure.abreviation !== abreviation` is false and the audit
  // is skipped even though the name changed.
  it.failing(
    "audits a name change that resends the unchanged abreviation",
    async () => {
      prismaMock.unitMeasure.update.mockResolvedValue(
        buildUnit({ name: "Gramo", abreviation: "kg" }),
      );

      await service.update(
        unitId,
        { name: "Gramo", abreviation: "kg" },
        currentUser,
      );

      expect(auditMock.createAuditLog).toHaveBeenCalledTimes(1);
    },
  );

  // Known defect: the conflict lookup only runs when the name is also being
  // changed. Updating only the abreviation to a value already used by another
  // unit bypasses the conflict check entirely.
  it.failing(
    "rejects a duplicate abreviation when updating only the abreviation",
    async () => {
      prismaMock.unitMeasure.findFirst.mockResolvedValue(
        buildUnit({ id: otherId, name: "Gramo", abreviation: "g" }),
      );

      await expect(
        service.update(unitId, { abreviation: "g" }, currentUser),
      ).rejects.toMatchObject({ status: 409 });
      expect(prismaMock.unitMeasure.update).not.toHaveBeenCalled();
    },
  );
});

describe("UnitMeasureService > create", () => {
  let service: InstanceType<typeof UnitMeasureService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
    );
    prismaMock.unitMeasure.findFirst.mockResolvedValue(null);
    prismaMock.unitMeasure.create.mockResolvedValue(buildUnit());
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        UnitMeasureService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(UnitMeasureService);
  });

  it("creates the unit and records the audit log", async () => {
    const unit = buildUnit();
    prismaMock.unitMeasure.create.mockResolvedValue(unit);

    const result: unknown = await service.create(
      { name: "Kilogramo", abreviation: "kg" },
      currentUser,
      "127.0.0.1",
    );

    expect(prismaMock.unitMeasure.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { equals: "Kilogramo", mode: "insensitive" } },
          { abreviation: { equals: "kg", mode: "insensitive" } },
        ],
      },
    });
    expect(prismaMock.unitMeasure.create).toHaveBeenCalledWith({
      data: { name: "Kilogramo", abreviation: "kg" },
    });
    expect(result).toBe(unit);
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      {
        userId: "admin-user-id",
        action: "CREATE",
        entity: "UNIT_MEASURE",
        entityId: unitId,
        newData: unit,
        reason: "Creación de la unidad de medida Kilogramo",
        ipAddress: "127.0.0.1",
      },
      prismaMock,
    );
  });

  it("rejects a duplicate name without distinguishing case", async () => {
    prismaMock.unitMeasure.findFirst.mockResolvedValue(
      buildUnit({ name: "KILOGRAMO" }),
    );

    await expect(
      service.create({ name: "Kilogramo", abreviation: "KGM" }, currentUser),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: "UNIT_NAME_ALREADY_EXISTS",
        message: "Unit Measure with this name already exists",
      },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.unitMeasure.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a duplicate abreviation without distinguishing case", async () => {
    prismaMock.unitMeasure.findFirst.mockResolvedValue(
      buildUnit({ name: "Gramo", abreviation: "KG" }),
    );

    await expect(
      service.create({ name: "Kilogramo", abreviation: "kg" }, currentUser),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: "UNIT_ABBREVIATION_ALREADY_EXISTS",
        message: "Unit Measure with this abreviation already exists",
      },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.unitMeasure.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });
});
