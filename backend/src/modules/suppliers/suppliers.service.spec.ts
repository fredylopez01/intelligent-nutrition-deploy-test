import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import type { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import type { UpdateSupplierDto } from "./dto/update-supplier.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;
type PersonDto = NonNullable<CreateSupplierDto["person"]>;
type PersonSource = Pick<CreateSupplierDto, "person" | "personId">;

const prismaMock = {
  person: { findUnique: jest.fn<AsyncMock>() },
  supplier: {
    findUnique: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  $transaction:
    jest.fn<(operation: TransactionOperation) => Promise<unknown>>(),
};

const personsServiceMock = {
  findOrCreateByDocument: jest.fn<AsyncMock>(),
  updateProfile: jest.fn<AsyncMock>(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
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
const { PersonsService } = await import("../persons/persons.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const currentUser: AuthenticatedUser = {
  id: "admin-person-id",
  active: true,
  role: { name: "SUPERADMIN" },
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

const personDto: PersonDto = {
  documentTypeId: "document-type-uuid",
  documentNumber: "900123456",
  businessName: "Distribuidora Salud SAS",
  email: "contacto@distribuidora.test",
  phone: "3001234567",
  address: "Calle 10 # 20-30",
};

const naturalPersonDto: PersonDto = {
  documentTypeId: "document-type-uuid",
  documentNumber: "1020304050",
  firstName: "Carlos",
  lastName: "Gómez",
  email: "carlos@proveedor.test",
  phone: "3107654321",
  address: "Carrera 15 # 25-35",
};

describe("SuppliersService.create", () => {
  let service: InstanceType<typeof SuppliersService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(prismaMock),
    );
    prismaMock.person.findUnique.mockResolvedValue({
      id: "person-uuid-1",
      active: true,
    });
    prismaMock.supplier.findUnique.mockResolvedValue(null);
    prismaMock.supplier.create.mockResolvedValue(supplierRecord);
    personsServiceMock.findOrCreateByDocument.mockResolvedValue({
      id: "person-new-uuid",
      active: true,
    });
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: PersonsService, useValue: personsServiceMock },
      ],
    }).compile();
    service = module.get(SuppliersService);
  });

  it("creates a supplier from an existing person and records the audit log", async () => {
    const result = await service.create(
      {
        personId: "person-uuid-1",
        commercialName: " Distribuidora Salud SAS ",
      },
      currentUser,
      "127.0.0.1",
    );

    expect(prismaMock.person.findUnique).toHaveBeenCalledWith({
      where: { id: "person-uuid-1" },
      select: { id: true, active: true },
    });
    expect(personsServiceMock.findOrCreateByDocument).not.toHaveBeenCalled();
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

  it("creates the supplier for the person resolved from the document", async () => {
    const result = await service.create(
      { person: personDto, commercialName: "Distribuidora Salud SAS" },
      currentUser,
    );

    expect(personsServiceMock.findOrCreateByDocument).toHaveBeenCalledWith(
      prismaMock,
      personDto,
    );
    expect(prismaMock.person.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: "person-new-uuid" }),
      }),
    );
    expect(result.id).toBe("person-uuid-1");
  });

  it("creates the supplier for a natural person", async () => {
    const naturalPerson = {
      ...supplierRecord.person,
      id: "natural-person-uuid",
      documentNumber: naturalPersonDto.documentNumber,
      firstName: naturalPersonDto.firstName,
      lastName: naturalPersonDto.lastName,
      businessName: null,
      email: naturalPersonDto.email,
      phone: naturalPersonDto.phone,
      address: naturalPersonDto.address,
    };
    personsServiceMock.findOrCreateByDocument.mockResolvedValue({
      id: naturalPerson.id,
      active: true,
    });
    prismaMock.supplier.create.mockResolvedValue({
      ...supplierRecord,
      personId: naturalPerson.id,
      commercialName: "Proveedor Carlos",
      person: naturalPerson,
    });

    const result = await service.create(
      { person: naturalPersonDto, commercialName: "Proveedor Carlos" },
      currentUser,
    );

    expect(personsServiceMock.findOrCreateByDocument).toHaveBeenCalledWith(
      prismaMock,
      naturalPersonDto,
    );
    expect(prismaMock.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          personId: naturalPerson.id,
          commercialName: "Proveedor Carlos",
        },
      }),
    );
    expect(result).toEqual({
      id: naturalPerson.id,
      person: naturalPerson,
      commercialName: "Proveedor Carlos",
    });
  });

  it("links the supplier to the person already registered for the document", async () => {
    personsServiceMock.findOrCreateByDocument.mockResolvedValue({
      id: "person-uuid-1",
      active: true,
    });

    await service.create(
      { person: personDto, commercialName: "Distribuidora Salud SAS" },
      currentUser,
    );

    expect(personsServiceMock.findOrCreateByDocument).toHaveBeenCalledTimes(1);
    expect(prismaMock.supplier.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: "person-uuid-1" }),
      }),
    );
  });

  it("rejects a duplicated NIT when the person is already a supplier", async () => {
    prismaMock.supplier.findUnique.mockResolvedValue({
      personId: "person-uuid-1",
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
    expect(prismaMock.supplier.findUnique).toHaveBeenCalledWith({
      where: { personId: "person-uuid-1" },
      select: { personId: true },
    });
    expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects a duplicated NIT when the unique constraint fails", async () => {
    prismaMock.supplier.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create(
        {
          personId: "person-uuid-1",
          commercialName: "Distribuidora Salud SAS",
        },
        currentUser,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "ALREADY_SUPPLIER" },
    });
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  const invalidPersonDetails: Array<[string, PersonDto, string]> = [
    [
      "no name",
      {
        ...naturalPersonDto,
        firstName: undefined,
        lastName: undefined,
      },
      "Provide businessName or both firstName and lastName",
    ],
    [
      "only a first name",
      { ...naturalPersonDto, lastName: undefined },
      "Provide businessName or both firstName and lastName",
    ],
    [
      "only a last name",
      { ...naturalPersonDto, firstName: undefined },
      "Provide businessName or both firstName and lastName",
    ],
    [
      "a business name and only a first name",
      { ...personDto, firstName: "Carlos" },
      "firstName and lastName must be provided together",
    ],
    [
      "a business name and only a last name",
      { ...personDto, lastName: "Rojas" },
      "firstName and lastName must be provided together",
    ],
  ];

  it.each(invalidPersonDetails)(
    "propagates the validation error for person data with %s",
    async (_label, invalidPerson, message) => {
      personsServiceMock.findOrCreateByDocument.mockRejectedValue(
        new BadRequestException(message),
      );

      await expect(
        service.create(
          { person: invalidPerson, commercialName: "Distribuidora Salud SAS" },
          currentUser,
        ),
      ).rejects.toMatchObject({ status: 400, message });

      expect(personsServiceMock.findOrCreateByDocument).toHaveBeenCalledWith(
        prismaMock,
        invalidPerson,
      );
      expect(prismaMock.supplier.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.supplier.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    },
  );

  const invalidSources: Array<[string, PersonSource]> = [
    [
      "both person and personId",
      { person: personDto, personId: "person-uuid-1" },
    ],
    ["neither person nor personId", {}],
  ];

  it.each(invalidSources)(
    "rejects the request when %s is provided",
    async (_label, source) => {
      await expect(
        service.create(
          { ...source, commercialName: "Distribuidora Salud SAS" },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

  const personsServiceErrors: Array<[string, Error, number]> = [
    [
      "document type",
      new NotFoundException("Active document type not found"),
      404,
    ],
    [
      "email already in use",
      new ConflictException({
        code: "EMAIL_ALREADY_IN_USE",
        message:
          "This email address is already associated with another person.",
        details: {},
      }),
      409,
    ],
  ];

  it.each(personsServiceErrors)(
    "propagates the %s error from the persons service and creates nothing",
    async (_label, error, status) => {
      personsServiceMock.findOrCreateByDocument.mockRejectedValue(error);

      await expect(
        service.create(
          { person: personDto, commercialName: "Distribuidora Salud SAS" },
          currentUser,
        ),
      ).rejects.toMatchObject({ status });
      expect(prismaMock.supplier.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.supplier.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing", null],
    ["inactive", { id: "person-uuid-1", active: false }],
  ])(
    "rejects supplier creation when the person is %s",
    async (_label, person) => {
      prismaMock.person.findUnique.mockResolvedValue(person);

      await expect(
        service.create(
          {
            personId: "person-uuid-1",
            commercialName: "Distribuidora Salud SAS",
          },
          currentUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.supplier.create).not.toHaveBeenCalled();
    },
  );

  it("rejects an inactive person during person-based creation", async () => {
    personsServiceMock.findOrCreateByDocument.mockResolvedValue({
      id: "person-uuid-1",
      active: false,
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
        {
          personId: "person-uuid-1",
          commercialName: "Distribuidora Salud SAS",
        },
        currentUser,
      ),
    ).rejects.toThrow("connection lost");
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });
});

describe("SuppliersService.update", () => {
  let service: InstanceType<typeof SuppliersService>;

  const updatedPerson = {
    ...supplierRecord.person,
    email: "ventas@distribuidora.test",
    phone: "3117654321",
  };
  const updatedSupplier = {
    ...supplierRecord,
    commercialName: "Distribuidora Salud Integral",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(prismaMock),
    );
    prismaMock.supplier.findUnique.mockResolvedValue(supplierRecord);
    prismaMock.supplier.update.mockResolvedValue(updatedSupplier);
    personsServiceMock.updateProfile.mockResolvedValue(updatedPerson);
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
        { provide: PersonsService, useValue: personsServiceMock },
      ],
    }).compile();
    service = module.get(SuppliersService);
  });

  it("updates person fields and records the change in the audit log", async () => {
    const changes: UpdateSupplierDto["person"] = {
      email: "ventas@distribuidora.test",
      phone: "3117654321",
    };

    const result = await service.update(
      "person-uuid-1",
      { person: changes },
      currentUser,
      "127.0.0.1",
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.supplier.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personId: "person-uuid-1" } }),
    );
    expect(personsServiceMock.updateProfile).toHaveBeenCalledWith(
      prismaMock,
      "person-uuid-1",
      changes,
    );
    expect(prismaMock.supplier.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: currentUser.id,
        action: "UPDATE",
        entity: "SUPPLIER",
        entityId: "person-uuid-1",
        oldData: {
          commercialName: supplierRecord.commercialName,
          person: supplierRecord.person,
        },
        newData: {
          commercialName: supplierRecord.commercialName,
          person: updatedPerson,
        },
        ipAddress: "127.0.0.1",
      }),
      prismaMock,
    );
    expect(result).toEqual({
      id: "person-uuid-1",
      person: updatedPerson,
      commercialName: supplierRecord.commercialName,
    });
  });

  it("propagates a 409 when the updated document is already in use", async () => {
    const conflict = new ConflictException({
      code: "DOCUMENT_ALREADY_IN_USE",
      message: "This document is already associated with another person.",
      details: {},
    });
    personsServiceMock.updateProfile.mockRejectedValue(conflict);

    await expect(
      service.update(
        "person-uuid-1",
        {
          person: {
            documentTypeId: "another-document-type",
            documentNumber: "900987654",
          },
        },
        currentUser,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "DOCUMENT_ALREADY_IN_USE" },
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.supplier.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it("performs supplier, person, and audit operations with the transaction client", async () => {
    const transactionClient = {
      supplier: {
        findUnique: prismaMock.supplier.findUnique,
        update: prismaMock.supplier.update,
      },
    };
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(transactionClient),
    );

    const result = await service.update(
      "person-uuid-1",
      {
        person: { phone: "3117654321" },
        commercialName: "Distribuidora Salud Integral",
      },
      currentUser,
    );

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.supplier.findUnique).toHaveBeenCalledTimes(1);
    expect(personsServiceMock.updateProfile).toHaveBeenCalledWith(
      transactionClient,
      "person-uuid-1",
      { phone: "3117654321" },
    );
    expect(prismaMock.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: "person-uuid-1" },
        data: { commercialName: "Distribuidora Salud Integral" },
      }),
    );
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      transactionClient,
    );
    expect(result).toEqual({
      id: "person-uuid-1",
      person: updatedPerson,
      commercialName: "Distribuidora Salud Integral",
    });
  });

  it("returns 404 and performs no updates when the supplier does not exist", async () => {
    prismaMock.supplier.findUnique.mockResolvedValue(null);

    await expect(
      service.update(
        "missing-supplier",
        { person: { phone: "3117654321" } },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(personsServiceMock.updateProfile).not.toHaveBeenCalled();
    expect(prismaMock.supplier.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });
});
