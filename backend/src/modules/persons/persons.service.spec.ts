import { jest, describe, beforeEach, it, expect } from "@jest/globals";

const { BadRequestException, ConflictException, NotFoundException } =
  await import("@nestjs/common");
const { PersonsService } = await import("./persons.service.js");

describe("PersonsService", () => {
  let service: InstanceType<typeof PersonsService>;
  let transaction: any;

  beforeEach(() => {
    service = new PersonsService();
    transaction = {
      documentType: { findUnique: jest.fn() },
      person: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    transaction.documentType.findUnique.mockResolvedValue({
      id: "document-type-uuid",
      active: true,
    });
    transaction.person.findUnique.mockResolvedValue(null);
    transaction.person.create.mockResolvedValue({ id: "person-uuid" });
  });

  it("creates a Person with normalized identity fields", async () => {
    await expect(
      service.create(
        transaction,
        {
          documentTypeId: "document-type-uuid",
          documentNumber: " 12345 ",
          firstName: " Juan ",
          lastName: " Perez ",
          email: " JUAN@EXAMPLE.COM ",
        },
        "juan@example.com",
      ),
    ).resolves.toBe("person-uuid");

    expect(transaction.person.create).toHaveBeenCalledWith({
      data: {
        documentTypeId: "document-type-uuid",
        documentNumber: "12345",
        firstName: "Juan",
        lastName: "Perez",
        email: "juan@example.com",
        phone: undefined,
        address: undefined,
      },
      select: { id: true },
    });
  });

  it("requires document type and number together", async () => {
    await expect(
      service.create(
        transaction,
        {
          documentTypeId: "document-type-uuid",
          firstName: "Juan",
          lastName: "Perez",
          email: "juan@example.com",
        },
        "juan@example.com",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects inactive document types", async () => {
    transaction.documentType.findUnique.mockResolvedValue({
      id: "document-type-uuid",
      active: false,
    });

    await expect(
      service.create(
        transaction,
        {
          documentTypeId: "document-type-uuid",
          documentNumber: "12345",
          firstName: "Juan",
          lastName: "Perez",
          email: "juan@example.com",
        },
        "juan@example.com",
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects duplicate document identities", async () => {
    transaction.person.findUnique.mockResolvedValue({ id: "existing-person" });

    await expect(
      service.create(
        transaction,
        {
          documentTypeId: "document-type-uuid",
          documentNumber: "12345",
          firstName: "Juan",
          lastName: "Perez",
          email: "juan@example.com",
        },
        "juan@example.com",
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("rejects a Person already associated with a user account", async () => {
    transaction.person.findUnique.mockResolvedValue({
      id: "person-uuid",
      active: true,
      email: "juan@example.com",
      userAccount: { personId: "person-uuid" },
    });

    await expect(
      service.findAvailableForUserAccount(transaction, "person-uuid"),
    ).rejects.toThrow(ConflictException);
  });

  it("updates only the provided person fields", async () => {
    transaction.person.update.mockResolvedValue({ id: "person-uuid" });

    await service.update(transaction, "person-uuid", {
      firstName: " Juan ",
    });

    expect(transaction.person.update).toHaveBeenCalledWith({
      where: { id: "person-uuid" },
      data: { firstName: "Juan" },
    });
  });
});
