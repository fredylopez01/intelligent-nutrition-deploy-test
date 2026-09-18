import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";

jest.unstable_mockModule("argon2", () => ({
  verify: jest.fn(),
}));

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    userAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  })),
}));

const argon2 = await import("argon2");
const { Test } = await import("@nestjs/testing");
const { AuthService } = await import("./auth.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { JwtService } = await import("@nestjs/jwt");
const { UnauthorizedException } = await import("@nestjs/common");
const { ConfigService } = await import("@nestjs/config");
const { EmailService } = await import("../email/email.service.js");

describe("AuthService", () => {
  let service: any;
  let prisma: any;
  let jwtService: any;

  const mockUser = {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    fullName: "Juan Perez",
    email: "juan@test.com",
    passwordHash: "$argon2id$hashedpassword",
    roleId: "role-uuid-1",
    active: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        PrismaService,
        {
          provide: JwtService,
          useValue: {
            signAsync: jest
              .fn<(...args: any[]) => Promise<any>>()
              .mockResolvedValue("mock-jwt-token"),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn<(...args: any[]) => any>().mockReturnValue("15m"),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendUserActivationEmail:
              jest.fn<(...args: any[]) => Promise<any>>(),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("login", () => {
    it("should return accessToken on successful login", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      prisma.userAccount.update.mockResolvedValue(mockUser);

      const result = await service.login({
        email: "juan@test.com",
        password: "password123",
      });

      expect(result).toEqual({
        accessToken: "mock-jwt-token",
        expiresIn: expect.any(String),
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: mockUser.id });
    });

    it("should throw UnauthorizedException when email does not exist", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: "noexiste@test.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException when password is incorrect", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(false);

      await expect(
        service.login({ email: "juan@test.com", password: "wrongpassword" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException when user is inactive", async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        ...mockUser,
        active: false,
      });

      await expect(
        service.login({ email: "juan@test.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should trim and lowercase email before lookup", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      prisma.userAccount.update.mockResolvedValue(mockUser);

      await service.login({
        email: "  JUAN@TEST.COM  ",
        password: "password123",
      });

      expect(prisma.userAccount.findUnique).toHaveBeenCalledWith({
        where: { email: "juan@test.com" },
      });
    });

    it("should update lastLoginAt on successful login", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      prisma.userAccount.update.mockResolvedValue(mockUser);

      await service.login({
        email: "juan@test.com",
        password: "password123",
      });

      expect(prisma.userAccount.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it("should not reveal whether email exists on wrong password", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(false);

      try {
        await service.login({ email: "juan@test.com", password: "wrong" });
      } catch (e: any) {
        expect(e.message).toBe("Invalid credentials");
      }

      prisma.userAccount.findUnique.mockResolvedValue(null);

      try {
        await service.login({ email: "noexiste@test.com", password: "wrong" });
      } catch (e: any) {
        expect(e.message).toBe("Invalid credentials");
      }
    });
  });
});
