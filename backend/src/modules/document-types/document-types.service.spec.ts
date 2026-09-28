import { jest, describe, beforeEach, it, expect } from "@jest/globals";

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    documentType: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  })),
}));

const { Test } = await import("@nestjs/testing");
const { ConflictException, NotFoundException, BadRequestException } =
  await import("@nestjs/common");
const { DocumentTypesService } = await import("./document-types.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");

describe("DocumentTypesService", () => {
  let service: InstanceType<typeof DocumentTypesService>;
  let prisma: any;

  const documentType = {
    id: "type-uuid-1",
    code: "CC",
    name: "Cedula de ciudadania",
    active: true,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DocumentTypesService, PrismaService],
    }).compile();

    service = module.get(DocumentTypesService);
    prisma = module.get(PrismaService);
  });

  it("creates a document type with trimmed fields", async () => {
    prisma.documentType.findUnique.mockResolvedValue(null);
    prisma.documentType.create.mockResolvedValue(documentType);

    await expect(
      service.create({ code: " CC ", name: " Cedula de ciudadania " }),
    ).resolves.toEqual(documentType);
    expect(prisma.documentType.create).toHaveBeenCalledWith({
      data: { code: "CC", name: "Cedula de ciudadania" },
    });
  });

  it("rejects duplicate codes", async () => {
    prisma.documentType.findUnique.mockResolvedValue(documentType);

    await expect(
      service.create({ code: "CC", name: "Cedula" }),
    ).rejects.toThrow(ConflictException);
  });

  it("lists document types by name with an optional active filter", async () => {
    prisma.documentType.findMany.mockResolvedValue([documentType]);

    await expect(service.findAll(true)).resolves.toEqual([documentType]);
    expect(prisma.documentType.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns not found for an unknown id", async () => {
    prisma.documentType.findUnique.mockResolvedValue(null);

    await expect(service.findOne("missing-id")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("updates provided fields", async () => {
    prisma.documentType.findUnique.mockResolvedValue(documentType);
    prisma.documentType.update.mockResolvedValue({
      ...documentType,
      name: "Cedula",
    });

    await service.update("type-uuid-1", { name: " Cedula " });

    expect(prisma.documentType.update).toHaveBeenCalledWith({
      where: { id: "type-uuid-1" },
      data: { name: "Cedula" },
    });
  });

  it("rejects an empty update", async () => {
    prisma.documentType.findUnique.mockResolvedValue(documentType);

    await expect(service.update("type-uuid-1", {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it("updates document type status", async () => {
    prisma.documentType.findUnique.mockResolvedValue(documentType);
    prisma.documentType.update.mockResolvedValue({
      ...documentType,
      active: false,
    });

    await service.updateStatus("type-uuid-1", false);

    expect(prisma.documentType.update).toHaveBeenCalledWith({
      where: { id: "type-uuid-1" },
      data: { active: false },
    });
  });
});
