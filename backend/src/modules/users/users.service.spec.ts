import { jest, describe, beforeEach, it, expect } from "@jest/globals";

jest.unstable_mockModule("../prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    userAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
  })),
}));

const { Test } = await import("@nestjs/testing");
const { ConflictException } = await import("@nestjs/common");
const { UsersService } = await import("./users.service");
const { PrismaService } = await import("../database/prisma/prisma.service.js");
const { CreateUserDto } = await import("./dto/create-user.dto");

describe("UsersService", () => {
  let service: UsersService;
  let prisma: any;

  const mockRole = { id: "role-uuid-1", name: "SUPERADMIN" };

  const mockUser = {
    id: "user-uuid-1",
    fullName: "Juan Pérez",
    email: "juan@test.com",
    roleId: "role-uuid-1",
    active: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService, PrismaService],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<any>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    const createUserDto = {
      fullName: "Juan Pérez",
      email: "juan@test.com",
      password: "password123",
      roleId: "role-uuid-1",
    } as CreateUserDto;

    it("should create a user successfully", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      const result = await service.create(createUserDto);

      expect(result).toEqual(mockUser);
      expect(result.email).toBe("juan@test.com");
      expect(result).not.toHaveProperty("passwordHash");
    });

    it("should throw ConflictException when email already exists", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should throw NotFoundException when role does not exist", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.create(createUserDto)).rejects.toThrow(
        "Role not found",
      );
    });

    it("should trim and lowercase email", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      await service.create({ ...createUserDto, email: "  JUAN@TEST.COM  " });

      expect(prisma.userAccount.findUnique).toHaveBeenCalledWith({
        where: { email: "juan@test.com" },
      });
    });

    it("should trim fullName", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      await service.create({ ...createUserDto, fullName: "  Juan Pérez  " });

      expect(prisma.userAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fullName: "Juan Pérez" }),
        }),
      );
    });

    it("should hash the password", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      await service.create(createUserDto);

      const createCall = prisma.userAccount.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe("password123");
      expect(createCall.data.passwordHash.length).toBeGreaterThan(0);
    });

    it("should not return passwordHash in response", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      const result = await service.create(createUserDto);

      expect(result).not.toHaveProperty("passwordHash");
    });
  });
});
