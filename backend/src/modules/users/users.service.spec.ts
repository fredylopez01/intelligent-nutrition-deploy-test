import { jest, describe, beforeEach, it, expect } from "@jest/globals";

import type { UsersService } from "./users.service.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
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
const { ConflictException, NotFoundException } = await import("@nestjs/common");
const { ConfigService } = await import("@nestjs/config");
const { UsersService: UsersServiceClass } = await import("./users.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { EmailService } = await import("../email/email.service.js");

const mockConfigService = {
  get: jest.fn<(...args: any[]) => any>().mockReturnValue(4320),
};

const mockEmailService = {
  sendUserActivationEmail: jest
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue(undefined),
};

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
    mustChangePassword: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersServiceClass,
        PrismaService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersServiceClass);
    prisma = module.get<any>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
        NotFoundException,
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

    it("should send activation email after creating user", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      await service.create(createUserDto);

      expect(mockEmailService.sendUserActivationEmail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendUserActivationEmail).toHaveBeenCalledWith(
        mockUser.email,
        mockUser.fullName,
        expect.any(String),
      );
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
