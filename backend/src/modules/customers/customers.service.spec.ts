import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import type { CreateCustomerDto } from "./dto/create-customer.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionOperation = (client: unknown) => Promise<unknown>;
type PersonDto = NonNullable<CreateCustomerDto["person"]>;

interface PersonRecord {
  id: string;
  active: boolean;
  documentTypeId: string;
  documentNumber: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  email: string;
  phone: string;
  address: string;
  documentType: { code: string; name: string };
}

const prismaMock = {
  person: { findUnique: jest.fn<AsyncMock>() },
  customer: { findUnique: jest.fn<AsyncMock>(), create: jest.fn<AsyncMock>() },
  $transaction:
    jest.fn<(operation: TransactionOperation) => Promise<unknown>>(),
};

const personsServiceMock = {
  findOrCreateByDocument: jest.fn<AsyncMock>(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { BadRequestException, NotFoundException } =
  await import("@nestjs/common");
const { CustomersService } = await import("./customers.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { PersonsService } = await import("../persons/persons.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const documentTypeId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-10-07T15:30:00.000Z");

const currentUser: AuthenticatedUser = {
  id: "admin-user-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

const naturalPersonDto: PersonDto = {
  documentTypeId,
  documentNumber: "1020304050",
  firstName: "Carlos",
  lastName: "Gómez",
  email: "carlos@e2e.test",
  phone: "3000000000",
  address: "Carrera 10 # 20-30",
};

const companyPersonDto: PersonDto = {
  documentTypeId,
  documentNumber: "900123456",
  businessName: "Nutrición Total SAS",
  email: "ventas@e2e.test",
  phone: "3101234567",
  address: "Calle 50 # 10-20",
};

function buildPerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    id: personId,
    active: true,
    documentTypeId,
    documentNumber: "1020304050",
    firstName: "Carlos",
    lastName: "Gómez",
    businessName: null,
    email: "carlos@e2e.test",
    phone: "3000000000",
    address: "Carrera 10 # 20-30",
    documentType: { code: "CC", name: "Cédula de ciudadanía" },
    ...overrides,
  };
}

function buildCustomerRecord(person: PersonRecord, fullName: string) {
  return {
    personId: person.id,
    fullName,
    active: true,
    createdAt,
    updatedAt: createdAt,
    person,
  };
}

describe("CustomersService.create", () => {
  let service: InstanceType<typeof CustomersService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(prismaMock),
    );
    personsServiceMock.findOrCreateByDocument.mockResolvedValue(buildPerson());
    prismaMock.person.findUnique.mockResolvedValue(buildPerson());
    prismaMock.customer.findUnique.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue(
      buildCustomerRecord(buildPerson(), "Carlos Gómez"),
    );
    auditMock.createAuditLog.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PersonsService, useValue: personsServiceMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(CustomersService);
  });

  describe("when the customer is created from a person block", () => {
    it("creates the customer for a new person and records the audit log", async () => {
      const person = buildPerson();
      const customer = buildCustomerRecord(person, "Carlos Gómez");
      personsServiceMock.findOrCreateByDocument.mockResolvedValue(person);
      prismaMock.customer.create.mockResolvedValue(customer);

      const result = await service.create(
        { person: naturalPersonDto },
        currentUser,
        "127.0.0.1",
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(personsServiceMock.findOrCreateByDocument).toHaveBeenCalledWith(
        prismaMock,
        naturalPersonDto,
      );
      expect(prismaMock.person.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { personId: person.id, fullName: "Carlos Gómez", active: true },
        }),
      );
      expect(result).toEqual({
        id: person.id,
        personId: person.id,
        fullName: "Carlos Gómez",
        active: true,
        createdAt,
        updatedAt: createdAt,
        person,
      });
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        {
          userId: "admin-user-id",
          action: "CREATE",
          entity: "CUSTOMER",
          entityId: person.id,
          newData: customer,
          reason: "Creación del cliente Carlos Gómez",
          ipAddress: "127.0.0.1",
        },
        prismaMock,
      );
    });

    it("uses the trimmed business name as the full name of a company", async () => {
      const person = buildPerson({
        documentNumber: "900123456",
        firstName: null,
        lastName: null,
        businessName: "  Nutrición Total SAS  ",
      });
      personsServiceMock.findOrCreateByDocument.mockResolvedValue(person);
      prismaMock.customer.create.mockResolvedValue(
        buildCustomerRecord(person, "Nutrición Total SAS"),
      );

      const result = await service.create(
        { person: companyPersonDto },
        currentUser,
      );

      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            personId: person.id,
            fullName: "Nutrición Total SAS",
            active: true,
          },
        }),
      );
      expect(result.fullName).toBe("Nutrición Total SAS");
    });

    it("links the customer to the person already registered for the document", async () => {
      const existingPerson = buildPerson({ id: "existing-person-id" });
      personsServiceMock.findOrCreateByDocument.mockResolvedValue(
        existingPerson,
      );
      prismaMock.customer.create.mockResolvedValue(
        buildCustomerRecord(existingPerson, "Carlos Gómez"),
      );

      const result = await service.create(
        { person: naturalPersonDto },
        currentUser,
      );

      expect(personsServiceMock.findOrCreateByDocument).toHaveBeenCalledTimes(
        1,
      );
      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ personId: "existing-person-id" }),
        }),
      );
      expect(result.id).toBe("existing-person-id");
    });

    it("rejects a document that belongs to an inactive person", async () => {
      personsServiceMock.findOrCreateByDocument.mockResolvedValue(
        buildPerson({ active: false }),
      );

      await expect(
        service.create({ person: naturalPersonDto }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("when the customer is created from an existing personId", () => {
    it("reuses the person without resolving the document again", async () => {
      const person = buildPerson();
      prismaMock.person.findUnique.mockResolvedValue(person);
      prismaMock.customer.create.mockResolvedValue(
        buildCustomerRecord(person, "Carlos Gómez"),
      );

      const result = await service.create({ personId }, currentUser);

      expect(prismaMock.person.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: personId } }),
      );
      expect(personsServiceMock.findOrCreateByDocument).not.toHaveBeenCalled();
      expect(prismaMock.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { personId, fullName: "Carlos Gómez", active: true },
        }),
      );
      expect(result.id).toBe(personId);
    });

    it.each([
      ["does not exist", null],
      ["is inactive", buildPerson({ active: false })],
    ])("rejects the request when the person %s", async (_label, person) => {
      prismaMock.person.findUnique.mockResolvedValue(person);

      await expect(
        service.create({ personId }, currentUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("when the request payload is invalid", () => {
    const invalidSources: Array<[string, CreateCustomerDto]> = [
      ["both person and personId", { person: naturalPersonDto, personId }],
      ["neither person nor personId", {}],
    ];

    it.each(invalidSources)(
      "rejects the request when %s is provided",
      async (_label, payload) => {
        await expect(
          service.create(payload, currentUser),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
        expect(prismaMock.customer.create).not.toHaveBeenCalled();
      },
    );

    const incompleteNames: Array<[string, PersonDto]> = [
      [
        "no name at all",
        { ...naturalPersonDto, firstName: undefined, lastName: undefined },
      ],
      ["only a first name", { ...naturalPersonDto, lastName: undefined }],
      ["only a last name", { ...naturalPersonDto, firstName: undefined }],
    ];

    it.each(incompleteNames)(
      "rejects a person block with %s and no business name",
      async (_label, person) => {
        await expect(
          service.create({ person }, currentUser),
        ).rejects.toMatchObject({
          status: 400,
          message: "Provide businessName or both firstName and lastName",
        });
        expect(
          personsServiceMock.findOrCreateByDocument,
        ).not.toHaveBeenCalled();
        expect(prismaMock.customer.create).not.toHaveBeenCalled();
      },
    );

    const loneIndividualNames: Array<[string, PersonDto]> = [
      ["only a first name", { ...companyPersonDto, firstName: "Carlos" }],
      ["only a last name", { ...companyPersonDto, lastName: "Gómez" }],
    ];

    it.each(loneIndividualNames)(
      "rejects a business name combined with %s",
      async (_label, person) => {
        await expect(
          service.create({ person }, currentUser),
        ).rejects.toMatchObject({
          status: 400,
          message: "firstName and lastName must be provided together",
        });
        expect(
          personsServiceMock.findOrCreateByDocument,
        ).not.toHaveBeenCalled();
        expect(prismaMock.customer.create).not.toHaveBeenCalled();
      },
    );

    it("propagates an invalid document type and creates nothing", async () => {
      personsServiceMock.findOrCreateByDocument.mockRejectedValue(
        new NotFoundException("Active document type not found"),
      );

      await expect(
        service.create({ person: naturalPersonDto }, currentUser),
      ).rejects.toMatchObject({
        status: 404,
        message: "Active document type not found",
      });
      expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("rejects a person whose names are blank", async () => {
      prismaMock.person.findUnique.mockResolvedValue(
        buildPerson({ businessName: "   ", firstName: null, lastName: null }),
      );

      await expect(
        service.create({ personId }, currentUser),
      ).rejects.toMatchObject({
        status: 400,
        message: "Person must have a businessName or a firstName and lastName",
      });
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
    });

    it("rejects a full name longer than 200 characters", async () => {
      prismaMock.person.findUnique.mockResolvedValue(
        buildPerson({
          businessName: "A".repeat(201),
          firstName: null,
          lastName: null,
        }),
      );

      await expect(
        service.create({ personId }, currentUser),
      ).rejects.toMatchObject({
        status: 400,
        message: "Customer full name cannot exceed 200 characters",
      });
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
    });
  });

  describe("when the person is already a customer", () => {
    it("rejects the request with ALREADY_CUSTOMER and writes nothing", async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ personId });

      await expect(
        service.create({ personId }, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          code: "ALREADY_CUSTOMER",
          message: "This person is already registered as a customer.",
        },
      });
      expect(prismaMock.customer.findUnique).toHaveBeenCalledWith({
        where: { personId },
        select: { personId: true },
      });
      expect(prismaMock.customer.create).not.toHaveBeenCalled();
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("maps a unique constraint violation to ALREADY_CUSTOMER", async () => {
      prismaMock.customer.create.mockRejectedValue({ code: "P2002" });

      await expect(
        service.create({ personId }, currentUser),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "ALREADY_CUSTOMER" },
      });
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("when the database or the audit log fails", () => {
    it("does not hide unexpected errors from the customer insert", async () => {
      prismaMock.customer.create.mockRejectedValue(
        new Error("connection lost"),
      );

      await expect(service.create({ personId }, currentUser)).rejects.toThrow(
        "connection lost",
      );
      expect(auditMock.createAuditLog).not.toHaveBeenCalled();
    });

    it("propagates the error when the audit log cannot be written", async () => {
      auditMock.createAuditLog.mockRejectedValue(
        new Error("audit unavailable"),
      );

      await expect(service.create({ personId }, currentUser)).rejects.toThrow(
        "audit unavailable",
      );
    });
  });
});
