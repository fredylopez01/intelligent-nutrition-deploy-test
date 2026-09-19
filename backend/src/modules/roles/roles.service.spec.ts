import { jest, describe, beforeEach, it, expect } from "@jest/globals";

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    role: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userAccount: {
      count: jest.fn(),
    },
  })),
}));

const { Test } = await import("@nestjs/testing");
const { RolesService } = await import("./roles.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { ConflictException, NotFoundException } = await import("@nestjs/common");

describe("RolesService", () => {
  let service: InstanceType<typeof RolesService>;
  let prisma: any;

  const mockRole = {
    id: "role-uuid-1",
    name: "SUPERADMIN",
    description: "Super administrador del sistema",
    createdAt: new Date("2026-09-14"),
    updatedAt: new Date("2026-09-14"),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RolesService, PrismaService],
    }).compile();

    service = module.get(RolesService);
    prisma = module.get(PrismaService);
  });

  describe("create", () => {
    it("should create a role successfully", async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      prisma.role.create.mockResolvedValue(mockRole);

      const result = await service.create({
        name: "SUPERADMIN",
        description: "Super administrador del sistema",
      });

      expect(result).toEqual(mockRole);
      expect(prisma.role.findUnique).toHaveBeenCalledWith({
        where: { name: "SUPERADMIN" },
      });
      expect(prisma.role.create).toHaveBeenCalledWith({
        data: {
          name: "SUPERADMIN",
          description: "Super administrador del sistema",
        },
      });
    });

    it("should throw ConflictException when role already exists", async () => {
      prisma.role.findUnique.mockResolvedValue(mockRole);

      await expect(service.create({ name: "SUPERADMIN" })).rejects.toThrow(
        ConflictException,
      );
    });

    it("should trim role name before checking existence", async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      prisma.role.create.mockResolvedValue(mockRole);

      await service.create({ name: "  SUPERADMIN  " });

      expect(prisma.role.findUnique).toHaveBeenCalledWith({
        where: { name: "SUPERADMIN" },
      });
    });

    it("should trim description before saving", async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      prisma.role.create.mockResolvedValue(mockRole);

      await service.create({
        name: "SUPERADMIN",
        description: "  descripcion con espacios  ",
      });

      expect(prisma.role.create).toHaveBeenCalledWith({
        data: {
          name: "SUPERADMIN",
          description: "descripcion con espacios",
        },
      });
    });

    it("should handle undefined description", async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      prisma.role.create.mockResolvedValue(mockRole);

      await service.create({ name: "SUPERADMIN" });

      expect(prisma.role.create).toHaveBeenCalledWith({
        data: {
          name: "SUPERADMIN",
          description: undefined,
        },
      });
    });
  });

  describe("findAll", () => {
    it("should return all roles ordered by name", async () => {
      const roles = [
        { id: "1", name: "AYUDANTE" },
        { id: "2", name: "LIDER" },
        { id: "3", name: "SUPERADMIN" },
      ];
      prisma.role.findMany.mockResolvedValue(roles);

      const result = await service.findAll();

      expect(result).toEqual(roles);
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        orderBy: { name: "asc" },
      });
    });

    it("should return empty array when no roles exist", async () => {
      prisma.role.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe("update", () => {
    it("should update a role successfully", async () => {
      const updatedRole = { ...mockRole, name: "LIDER SEDE" };
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.role.update.mockResolvedValue(updatedRole);

      const result = await service.update("role-uuid-1", {
        name: "LIDER SEDE",
      });

      expect(result).toEqual(updatedRole);
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: "role-uuid-1" },
        data: { name: "LIDER SEDE" },
      });
    });

    it("should throw NotFoundException when role does not exist", async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.update("non-existent", { name: "NEW NAME" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when new name is already in use", async () => {
      const otherRole = { id: "role-uuid-2", name: "EXISTING NAME" };
      prisma.role.findUnique
        .mockResolvedValueOnce(mockRole) // first call: find role by id
        .mockResolvedValueOnce(otherRole); // second call: find role by name

      await expect(
        service.update("role-uuid-1", { name: "EXISTING NAME" }),
      ).rejects.toThrow(ConflictException);
    });

    it("should allow keeping the same name", async () => {
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.role.update.mockResolvedValue(mockRole);

      const result = await service.update("role-uuid-1", {
        name: "SUPERADMIN",
      });

      expect(result).toEqual(mockRole);
    });

    it("should update description only", async () => {
      const updatedRole = { ...mockRole, description: "Nueva descripcion" };
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.role.update.mockResolvedValue(updatedRole);

      const result = await service.update("role-uuid-1", {
        description: "Nueva descripcion",
      });

      expect(result).toEqual(updatedRole);
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: "role-uuid-1" },
        data: { description: "Nueva descripcion" },
      });
    });

    it("should trim name and description before updating", async () => {
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.role.update.mockResolvedValue(mockRole);

      await service.update("role-uuid-1", {
        name: "  LIDER SEDE  ",
        description: "  descripcion  ",
      });

      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: "role-uuid-1" },
        data: {
          name: "LIDER SEDE",
          description: "descripcion",
        },
      });
    });
  });

  describe("remove", () => {
    it("should delete a role successfully", async () => {
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.count.mockResolvedValue(0);
      prisma.role.delete.mockResolvedValue(mockRole);

      const result = await service.remove("role-uuid-1");

      expect(result).toEqual({ message: "Role deleted successfully" });
      expect(prisma.role.delete).toHaveBeenCalledWith({
        where: { id: "role-uuid-1" },
      });
    });

    it("should throw NotFoundException when role does not exist", async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.remove("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw ConflictException when role is assigned to users", async () => {
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.count.mockResolvedValue(3);

      await expect(service.remove("role-uuid-1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("should check user count before deleting", async () => {
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.count.mockResolvedValue(0);
      prisma.role.delete.mockResolvedValue(mockRole);

      await service.remove("role-uuid-1");

      expect(prisma.userAccount.count).toHaveBeenCalledWith({
        where: { roleId: "role-uuid-1" },
      });
    });
  });
});
