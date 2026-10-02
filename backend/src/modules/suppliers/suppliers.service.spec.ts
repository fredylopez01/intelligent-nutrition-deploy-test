import { jest, describe, beforeEach, it, expect } from "@jest/globals";

const prismaMock: any = {
  documentType: { findUnique: jest.fn() },
  person: { findUnique: jest.fn(), create: jest.fn() },
  supplier: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { BadRequestException, ConflictException, NotFoundException } =
  await import("@nestjs/common");
const { SuppliersService } = await import("./suppliers.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const auditMock = {
  createAuditLog: jest.fn<(...args: any[]) => Promise<any>>(),
};

const currentUser = {
  id: "admin-person-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

const personSelect = {
  id: true,
  active: true,
  supplier: { select: { personId: true } },
};

const supplierRecord = {
  personId: "person-uuid-1",
  commercialName: "Distribuidora Salud SAS",
  person: {
    id: "person-uuid-1",
    documentTypeId: "document-type-uuid",
    documentNumber: "900123456",
    firstName: null,
    lastName: null,
    businessName: "Distribuidora Salud SAS",
    email: "contacto@distribuidora.test",
    phone: "3001234567",
    address: "Calle 10 # 20-30",
  },
};

const personDto = {
  documentTypeId: "document-type-uuid",
  documentNumber: "900123456",
  businessName: "Distribuidora Salud SAS",
  email: "contacto@distribuidora.test",
  phone: "3001234567",
  address: "Calle 10 # 20-30",
};

describe("SuppliersService.create", () => {
  let service: InstanceType<typeof SuppliersService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation: any) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
    );
    prismaMock.documentType.findUnique.mockResolvedValue({
      id: "document-type-uuid",
      active: true,
    });
    prismaMock.person.findUnique.mockResolvedValue({
      id: "person-uuid-1",
      active: true,
      supplier: null,
    });
    prismaMock.person.create.mockResolvedValue({ id: "person-new-uuid" });
    prismaMock.supplier.create.mockResolvedValue(supplierRecord);
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(SuppliersService);
  });

  it("creates a supplier from an existing person and records the audit log", async () => {
    const result = await service.create(
      { personId: "person-uuid-1", commercialName: " Distribuidora Salud SAS " },
      currentUser,
      "127.0.0.1",
    );

    expect(prismaMock.person.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "person-uuid-1" },
        select: personSelect,
      }),
    );
    expect(prismaMock.person.create).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          personId: "person-uuid-1",
          commercialName: "Distribuidora Salud SAS",
        },
      }),
    );
    expect(result).toEqual({
      id: "person-uuid-1",
      person: supplierRecord.person,
      commercialName: "Distribuidora Salud SAS",
    });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-person-id",
        action: "CREATE",
        entity: "SUPPLIER",
        entityId: "person-uuid-1",
        newData: {
          person: supplierRecord.person,
          commercialName: "Distribuidora Salud SAS",
        },
        reason: expect.stringContaining("Creación del proveedor"),
        ipAddress: "127.0.0.1",
      }),
      prismaMock,
    );
  });

  it("creates a new person when the document does not exist", async () => {
    prismaMock.person.findUnique.mockResolvedValue(null);

    const result = await service.create(
      { person: personDto, commercialName: "Distribuidora Salud SAS" },
      currentUser,
    );

    expect(prismaMock.documentType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "document-type-uuid" },
        select: { id: true, active: true },
      }),
    );
    expect(prismaMock.person.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          documentTypeId_documentNumber: {
            documentTypeId: "document-type-uuid",
            documentNumber: "900123456",
          },
        },
      }),
    );
    expect(prismaMock.person.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentTypeId: "document-type-uuid",
          documentNumber: "900123456",
          businessName: "Distribuidora Salud SAS",
        }),
      }),
    );
    expect(prismaMock.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: "person-new-uuid" }),
      }),
    );
    expect(result.id).toBe("person-uuid-1");
  });

  it("reuses an existing active person without duplicating it", async () => {
    await service.create(
      { person: personDto, commercialName: "Distribuidora Salud SAS" },
      currentUser,
    );

    expect(prismaMock.person.create).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a duplicated NIT when the person is already a supplier", async () => {
    prismaMock.person.findUnique.mockResolvedValue({
      id: "person-uuid-1",
      active: true,
      supplier: { personId: "person-uuid-1" },
    });

    await expect(
      service.create(
        { personId: "person-uuid-1", commercialName: "Otra Razon Social" },
        currentUser,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: "ALREADY_SUPPLIER",
        message: "This person is already registered as a supplier.",
      },
    });
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a duplicated NIT when the unique constraint fails", async () => {
    prismaMock.supplier.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create(
        { personId: "person-uuid-1", commercialName: "Distribuidora Salud SAS" },
        currentUser,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "ALREADY_SUPPLIER" },
    });
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    ["both person and personId", { person: personDto, personId: "person-uuid-1" }],
    ["neither person nor personId", {} as any],
  ])("rejects the request when %s is provided", async (_label, payload) => {
    await expect(
      service.create(
        { ...payload, commercialName: "Distribuidora Salud SAS" },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["inactive", { id: "document-type-uuid", active: false }],
  ])(
    "rejects person creation when the document type is %s",
    async (_label, documentType) => {
      prismaMock.documentType.findUnique.mockResolvedValue(documentType);

      await expect(
        service.create(
          { person: personDto, commercialName: "Distribuidora Salud SAS" },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing", null],
    ["inactive", { id: "person-uuid-1", active: false, supplier: null }],
  ])(
    "rejects supplier creation when the person is %s",
    async (_label, person) => {
      prismaMock.person.findUnique.mockResolvedValue(person);

      await expect(
        service.create(
          { personId: "person-uuid-1", commercialName: "Distribuidora Salud SAS" },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    },
  );

  it("rejects an inactive person during person-based creation", async () => {
    prismaMock.person.findUnique.mockResolvedValue({
      id: "person-uuid-1",
      active: false,
      supplier: null,
    });

    await expect(
      service.create(
        { person: personDto, commercialName: "Distribuidora Salud SAS" },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
  });

  it("rethrows non-unique supplier errors without auditing", async () => {
    prismaMock.supplier.create.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.create(
        { personId: "person-uuid-1", commercialName: "Distribuidora Salud SAS" },
        currentUser,
      ),
    ).rejects.toThrow("connection lost");
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });
});
