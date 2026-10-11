import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import type { CreatePersonDto } from "./dto/create-person.dto.js";
import type { ListPersonsQueryDto } from "./dto/list-persons-query.dto.js";
import type { UpdatePersonProfileDto } from "./dto/update-person-profile.dto.js";
import type { PersonIdentityInput } from "./persons.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

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
  person: { count: jest.fn<AsyncMock>(), findMany: jest.fn<AsyncMock>() },
  $transaction:
    jest.fn<(operations: Array<Promise<unknown>>) => Promise<unknown>>(),
};

const transactionMock = {
  documentType: { findUnique: jest.fn<AsyncMock>() },
  person: {
    findUnique: jest.fn<AsyncMock>(),
    findFirst: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { PersonsService } = await import("./persons.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");

type PersonTransaction = Parameters<
  InstanceType<typeof PersonsService>["findOrCreateByDocument"]
>[0];

const asTransaction = (): PersonTransaction =>
  transactionMock as unknown as PersonTransaction;

const documentTypeId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";

const identity: PersonIdentityInput = {
  documentTypeId,
  documentNumber: "1020304050",
  firstName: "Juan",
  lastName: "Perez",
  email: "Juan@E2E.test",
  phone: "3000000000",
  address: "Carrera 10 # 20-30",
};

function buildPerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    id: personId,
    active: true,
    documentTypeId,
    documentNumber: "1020304050",
    firstName: "Juan",
    lastName: "Perez",
    businessName: null,
    email: "juan@e2e.test",
    phone: "3000000000",
    address: "Carrera 10 # 20-30",
    documentType: { code: "CC", name: "Cédula de ciudadanía" },
    ...overrides,
  };
}

describe("PersonsService", () => {
  let service: InstanceType<typeof PersonsService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operations) =>
      Promise.all(operations),
    );
    prismaMock.person.count.mockResolvedValue(0);
    prismaMock.person.findMany.mockResolvedValue([]);
    transactionMock.documentType.findUnique.mockResolvedValue({
      id: documentTypeId,
      active: true,
    });
    transactionMock.person.findUnique.mockResolvedValue(null);
    transactionMock.person.findFirst.mockResolvedValue(null);
    transactionMock.person.create.mockResolvedValue(buildPerson());
    transactionMock.person.update.mockResolvedValue(buildPerson());

    const module = await Test.createTestingModule({
      providers: [
        PersonsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(PersonsService);
  });

  describe("findOrCreateByDocument", () => {
    it("creates a person with a lowercase email when the document is new", async () => {
      const created = buildPerson();
      transactionMock.person.create.mockResolvedValue(created);

      const result = await service.findOrCreateByDocument(
        asTransaction(),
        identity,
      );

      expect(transactionMock.documentType.findUnique).toHaveBeenCalledWith({
        where: { id: documentTypeId },
        select: { id: true, active: true },
      });
      expect(transactionMock.person.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            documentTypeId_documentNumber: {
              documentTypeId,
              documentNumber: "1020304050",
            },
          },
        }),
      );
      expect(transactionMock.person.findFirst).toHaveBeenCalledWith({
        where: { email: { equals: "juan@e2e.test", mode: "insensitive" } },
        select: { id: true },
      });
      expect(transactionMock.person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            documentTypeId,
            documentNumber: "1020304050",
            firstName: "Juan",
            lastName: "Perez",
            businessName: undefined,
            email: "juan@e2e.test",
            phone: "3000000000",
            address: "Carrera 10 # 20-30",
          },
        }),
      );
      expect(result).toBe(created);
    });

    it("reuses the person already registered for the document", async () => {
      const existing = buildPerson({ id: "existing-person-id" });
      transactionMock.person.findUnique.mockResolvedValue(existing);

      const result = await service.findOrCreateByDocument(
        asTransaction(),
        identity,
      );

      expect(result).toBe(existing);
      expect(transactionMock.person.findFirst).not.toHaveBeenCalled();
      expect(transactionMock.person.create).not.toHaveBeenCalled();
    });

    const invalidNames: Array<[string, PersonIdentityInput, string]> = [
      [
        "no business name and no individual names",
        { ...identity, firstName: undefined, lastName: undefined },
        "Provide businessName or both firstName and lastName",
      ],
      [
        "only a first name",
        { ...identity, lastName: undefined },
        "firstName and lastName must be provided together",
      ],
      [
        "only a last name",
        { ...identity, firstName: undefined },
        "firstName and lastName must be provided together",
      ],
    ];

    it.each(invalidNames)(
      "rejects a person with %s",
      async (_label, input, message) => {
        await expect(
          service.findOrCreateByDocument(asTransaction(), input),
        ).rejects.toMatchObject({ status: 400, message });
        expect(transactionMock.documentType.findUnique).not.toHaveBeenCalled();
        expect(transactionMock.person.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["missing", null],
      ["inactive", { id: documentTypeId, active: false }],
    ])(
      "rejects the person when the document type is %s",
      async (_label, documentType) => {
        transactionMock.documentType.findUnique.mockResolvedValue(documentType);

        await expect(
          service.findOrCreateByDocument(asTransaction(), identity),
        ).rejects.toMatchObject({
          status: 404,
          message: "Active document type not found",
        });
        expect(transactionMock.person.findUnique).not.toHaveBeenCalled();
        expect(transactionMock.person.create).not.toHaveBeenCalled();
      },
    );

    it("rejects an email already associated with another person", async () => {
      transactionMock.person.findFirst.mockResolvedValue({
        id: "other-person",
      });

      await expect(
        service.findOrCreateByDocument(asTransaction(), identity),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "EMAIL_ALREADY_IN_USE" },
      });
      expect(transactionMock.person.create).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("returns the id of the resolved person using the account email", async () => {
      const personDto: CreatePersonDto = {
        documentTypeId,
        documentNumber: "1020304050",
        firstName: "Juan",
        lastName: "Perez",
        email: "ignored@e2e.test",
        phone: "3000000000",
        address: "Carrera 10 # 20-30",
      };

      const result = await service.create(
        asTransaction(),
        personDto,
        "Account@E2E.test",
      );

      expect(result).toBe(personId);
      expect(transactionMock.person.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            email: { equals: "account@e2e.test", mode: "insensitive" },
          },
        }),
      );
      expect(transactionMock.person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "account@e2e.test" }),
        }),
      );
    });
  });

  describe("findAvailableForUserAccount", () => {
    it("returns the id of an active person with an email and no account", async () => {
      transactionMock.person.findUnique.mockResolvedValue({
        id: personId,
        active: true,
        email: "juan@e2e.test",
        userAccount: null,
      });

      const result = await service.findAvailableForUserAccount(
        asTransaction(),
        personId,
      );

      expect(result).toBe(personId);
      expect(transactionMock.person.findUnique).toHaveBeenCalledWith({
        where: { id: personId },
        select: {
          id: true,
          active: true,
          email: true,
          userAccount: { select: { personId: true } },
        },
      });
    });

    it.each([
      ["does not exist", null],
      [
        "is inactive",
        { id: personId, active: false, email: "a@e2e.test", userAccount: null },
      ],
    ])("rejects a person that %s", async (_label, person) => {
      transactionMock.person.findUnique.mockResolvedValue(person);

      await expect(
        service.findAvailableForUserAccount(asTransaction(), personId),
      ).rejects.toMatchObject({
        status: 404,
        message: "Active person not found",
      });
    });

    it("rejects a person without an email address", async () => {
      transactionMock.person.findUnique.mockResolvedValue({
        id: personId,
        active: true,
        email: null,
        userAccount: null,
      });

      await expect(
        service.findAvailableForUserAccount(asTransaction(), personId),
      ).rejects.toMatchObject({
        status: 400,
        message:
          "Person must have an email address before creating a user account",
      });
    });

    it("rejects a person already associated with a user account", async () => {
      transactionMock.person.findUnique.mockResolvedValue({
        id: personId,
        active: true,
        email: "juan@e2e.test",
        userAccount: { personId },
      });

      await expect(
        service.findAvailableForUserAccount(asTransaction(), personId),
      ).rejects.toMatchObject({
        status: 409,
        message: "Person already has a user account",
      });
    });
  });

  describe("updateProfile", () => {
    it("updates only the provided person fields", async () => {
      const updated = buildPerson({ firstName: "Juan Carlos" });
      transactionMock.person.update.mockResolvedValue(updated);
      const changes: UpdatePersonProfileDto = { firstName: "Juan Carlos" };

      const result = await service.updateProfile(
        asTransaction(),
        personId,
        changes,
      );

      expect(transactionMock.person.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: personId },
          data: { firstName: "Juan Carlos" },
        }),
      );
      expect(transactionMock.documentType.findUnique).not.toHaveBeenCalled();
      expect(transactionMock.person.findUnique).not.toHaveBeenCalled();
      expect(transactionMock.person.findFirst).not.toHaveBeenCalled();
      expect(result).toBe(updated);
    });

    it("clears the names that are sent as null", async () => {
      await service.updateProfile(asTransaction(), personId, {
        firstName: null,
        lastName: null,
        businessName: "Nutrición Total SAS",
      });

      expect(transactionMock.person.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            firstName: null,
            lastName: null,
            businessName: "Nutrición Total SAS",
          },
        }),
      );
    });

    it("stores the email in lowercase after checking it is free", async () => {
      await service.updateProfile(asTransaction(), personId, {
        email: "Nuevo@E2E.test",
      });

      expect(transactionMock.person.findFirst).toHaveBeenCalledWith({
        where: {
          id: { not: personId },
          email: { equals: "nuevo@e2e.test", mode: "insensitive" },
        },
        select: { id: true },
      });
      expect(transactionMock.person.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { email: "nuevo@e2e.test" } }),
      );
    });

    it("rejects an email used by another person", async () => {
      transactionMock.person.findFirst.mockResolvedValue({
        id: "other-person",
      });

      await expect(
        service.updateProfile(asTransaction(), personId, {
          email: "taken@e2e.test",
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "EMAIL_ALREADY_IN_USE" },
      });
      expect(transactionMock.person.update).not.toHaveBeenCalled();
    });

    const loneDocumentFields: Array<[string, UpdatePersonProfileDto]> = [
      ["only the document type", { documentTypeId }],
      ["only the document number", { documentNumber: "1020304050" }],
    ];

    it.each(loneDocumentFields)(
      "rejects a change with %s",
      async (_label, changes) => {
        await expect(
          service.updateProfile(asTransaction(), personId, changes),
        ).rejects.toMatchObject({
          status: 400,
          message:
            "documentTypeId and documentNumber must be provided together",
        });
        expect(transactionMock.person.update).not.toHaveBeenCalled();
      },
    );

    it("rejects a document type that is missing or inactive", async () => {
      transactionMock.documentType.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile(asTransaction(), personId, {
          documentTypeId,
          documentNumber: "1020304050",
        }),
      ).rejects.toMatchObject({
        status: 404,
        message: "Active document type not found",
      });
      expect(transactionMock.person.update).not.toHaveBeenCalled();
    });

    it("rejects a document already used by another person", async () => {
      transactionMock.person.findUnique.mockResolvedValue({
        id: "other-person",
      });

      await expect(
        service.updateProfile(asTransaction(), personId, {
          documentTypeId,
          documentNumber: "1020304050",
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "DOCUMENT_ALREADY_IN_USE" },
      });
      expect(transactionMock.person.update).not.toHaveBeenCalled();
    });

    it("accepts the document that already belongs to the same person", async () => {
      transactionMock.person.findUnique.mockResolvedValue({ id: personId });

      await service.updateProfile(asTransaction(), personId, {
        documentTypeId,
        documentNumber: "1020304050",
      });

      expect(transactionMock.person.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { documentTypeId, documentNumber: "1020304050" },
        }),
      );
    });
  });

  describe("findAll", () => {
    it("returns the active people with relationship flags and pagination", async () => {
      prismaMock.person.count.mockResolvedValue(25);
      prismaMock.person.findMany.mockResolvedValue([
        {
          id: personId,
          documentTypeId,
          documentNumber: "1020304050",
          firstName: "Juan",
          lastName: "Perez",
          businessName: null,
          email: "juan@e2e.test",
          phone: "3000000000",
          address: "Carrera 10 # 20-30",
          userAccount: { personId },
          customer: null,
          supplier: { personId },
        },
      ]);
      const query: ListPersonsQueryDto = { page: 2, limit: 10, search: "juan" };

      const result = await service.findAll(query);

      expect(prismaMock.person.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          active: true,
          OR: expect.any(Array),
        }),
      });
      expect(prismaMock.person.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.data[0]).toMatchObject({
        id: personId,
        relationships: {
          hasUserAccount: true,
          isCustomer: false,
          isSupplier: true,
        },
      });
      expect(result.data[0]).not.toHaveProperty("userAccount");
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it("returns zero pages and no text filter when there are no people", async () => {
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prismaMock.person.count).toHaveBeenCalledWith({
        where: { active: true },
      });
      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it("rejects a search shorter than 2 characters", async () => {
      await expect(
        service.findAll({ page: 1, limit: 10, search: "a" }),
      ).rejects.toMatchObject({
        status: 400,
        response: { code: "SEARCH_TOO_SHORT" },
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
