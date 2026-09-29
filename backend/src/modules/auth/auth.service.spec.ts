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
  hash: jest.fn(),
}));

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    userAccount: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  })),
}));

const argon2 = await import("argon2");
const { Test } = await import("@nestjs/testing");
const { AuthService } = await import("./auth.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { JwtService } = await import("@nestjs/jwt");
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} = await import("@nestjs/common");
const { ConfigService } = await import("@nestjs/config");
const { EmailService } = await import("../email/email.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const mockEmailService = {
  sendUserActivationEmail: jest.fn<(...args: any[]) => Promise<any>>(),
  sendPasswordResetEmail: jest.fn<(...args: any[]) => Promise<any>>(),
};
const mockAuditService = {
  createAuditLog: jest.fn<(...args: any[]) => Promise<any>>(),
};

describe("AuthService", () => {
  let service: any;
  let prisma: any;
  let jwtService: any;

  const mockUser = {
    personId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    password: "$argon2id$hashedpassword",
    roleId: "role-uuid-1",
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: { id: "role-uuid-1", name: "SUPERADMIN", active: true },
    person: {
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      firstName: "Juan",
      lastName: "Perez",
      email: "juan@test.com",
      active: true,
    },
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
            get: jest
              .fn<(...args: any[]) => any>()
              .mockImplementation((key: string, defaultValue?: unknown) => {
                if (key === "JWT_EXPIRES_IN") return "15m";
                if (key === "FRONTEND_URL") return "https://frontend.test";
                return defaultValue;
              }),
          },
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
    prisma.$transaction.mockImplementation((operation: any) =>
      operation(prisma),
    );
    prisma.userAccount.updateMany.mockResolvedValue({ count: 1 });
    mockAuditService.createAuditLog.mockResolvedValue({});
    mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("login", () => {
    it("should return accessToken on successful login", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      prisma.userAccount.update.mockResolvedValue(mockUser);

      const result = await service.login({
        email: "juan@test.com",
        password: "password123",
      });

      expect(result).toEqual({
        accessToken: "mock-jwt-token",
        tokenType: "Bearer",
        user: {
          id: mockUser.personId,
          personId: mockUser.personId,
          role: { id: "role-uuid-1", name: "SUPERADMIN" },
          mustChangePassword: false,
        },
      });
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: mockUser.personId,
      });
    });

    it("should throw UnauthorizedException when email does not exist", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: "noexiste@test.com", password: "password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw UnauthorizedException when password is incorrect", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(false);

      await expect(
        service.login({ email: "juan@test.com", password: "wrongpassword" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should throw ForbiddenException when user is inactive", async () => {
      prisma.userAccount.findFirst.mockResolvedValue({
        ...mockUser,
        active: false,
      });

      await expect(
        service.login({ email: "juan@test.com", password: "password123" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should reject login when the assigned role is inactive", async () => {
      prisma.userAccount.findFirst.mockResolvedValue({
        ...mockUser,
        role: { ...mockUser.role, active: false },
      });

      await expect(
        service.login({ email: "juan@test.com", password: "password123" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should reject login until the account is activated", async () => {
      prisma.userAccount.findFirst.mockResolvedValue({
        ...mockUser,
        password: null,
        mustChangePassword: true,
      });

      await expect(
        service.login({ email: "juan@test.com", password: "password123" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should trim and lowercase email before lookup", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      prisma.userAccount.update.mockResolvedValue(mockUser);

      await service.login({
        email: "  JUAN@TEST.COM  ",
        password: "password123",
      });

      expect(prisma.userAccount.findFirst).toHaveBeenCalledWith({
        where: { person: { is: { email: "juan@test.com" } } },
        select: expect.any(Object),
      });
    });

    it("should update lastLoginAt on successful login", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      prisma.userAccount.update.mockResolvedValue(mockUser);

      await service.login({
        email: "juan@test.com",
        password: "password123",
      });

      expect(prisma.userAccount.update).toHaveBeenCalledWith({
        where: { personId: mockUser.personId },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it("should not reveal whether email exists on wrong password", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(false);

      try {
        await service.login({ email: "juan@test.com", password: "wrong" });
      } catch (e: any) {
        expect(e.getResponse().code).toBe("INVALID_CREDENTIALS");
      }

      prisma.userAccount.findFirst.mockResolvedValue(null);

      try {
        await service.login({ email: "noexiste@test.com", password: "wrong" });
      } catch (e: any) {
        expect(e.getResponse().code).toBe("INVALID_CREDENTIALS");
      }
    });
  });

  describe("activateAccount", () => {
    it("stores a password and consumes the hashed activation token", async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        personId: mockUser.personId,
        password: null,
        active: true,
        mustChangePassword: true,
        activationTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      (argon2.hash as any).mockResolvedValue("new-password-hash");

      const result = await service.activateAccount({
        token: "raw-token",
        password: "StrongPassword123!",
      });

      expect(result).toEqual({ message: "Account activated successfully." });

      expect(prisma.userAccount.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { activationToken: expect.any(String) },
        }),
      );
      expect(prisma.userAccount.update).toHaveBeenCalledWith({
        where: { personId: mockUser.personId },
        data: {
          password: "new-password-hash",
          mustChangePassword: false,
          activationToken: null,
          activationTokenExpiresAt: null,
        },
      });
    });

    it("rejects an expired activation token", async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        personId: mockUser.personId,
        password: null,
        active: true,
        mustChangePassword: true,
        activationTokenExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.activateAccount({ token: "expired", password: "password" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects activating an already activated account", async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        personId: mockUser.personId,
        password: mockUser.password,
        active: true,
        mustChangePassword: false,
        activationTokenExpiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.activateAccount({ token: "used", password: "password" }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("forgotPassword", () => {
    it("stores only a hashed expiring token and sends the reset link", async () => {
      prisma.userAccount.findFirst.mockResolvedValue({
        personId: mockUser.personId,
        person: {
          email: "juan@test.com",
          firstName: "Juan",
          lastName: "Perez",
        },
      });

      const result = await service.forgotPassword({ email: " JUAN@TEST.COM " });

      expect(result.message).toContain("If an account with that email exists");
      expect(prisma.userAccount.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            active: true,
            mustChangePassword: false,
            person: { is: { email: "juan@test.com", active: true } },
          }),
        }),
      );
      expect(prisma.userAccount.update).toHaveBeenCalledWith({
        where: { personId: mockUser.personId },
        data: {
          passwordResetToken: expect.any(String),
          passwordResetTokenExpiresAt: expect.any(Date),
        },
      });
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        "juan@test.com",
        "Juan Perez",
        expect.stringContaining("/reset-password?token="),
        60,
      );
    });

    it("returns the same response when the account does not exist", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: "missing@test.com",
      });

      expect(result.message).toContain("If an account with that email exists");
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(prisma.userAccount.update).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("hashes the new password, consumes the token, and audits the reset", async () => {
      prisma.userAccount.findUnique.mockResolvedValue({
        personId: mockUser.personId,
        active: true,
        mustChangePassword: false,
        passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      (argon2.hash as any).mockResolvedValue("new-password-hash");

      const result = await service.resetPassword({
        token: "raw-reset-token",
        password: "StrongPassword123!",
      });

      expect(result).toEqual({ message: "Password reset successfully." });
      expect(prisma.userAccount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            personId: mockUser.personId,
            passwordResetToken: expect.any(String),
          }),
          data: {
            password: "new-password-hash",
            passwordResetToken: null,
            passwordResetTokenExpiresAt: null,
          },
        }),
      );
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.personId,
          action: "PASSWORD_RESET",
          entity: "USER",
          entityId: mockUser.personId,
          newData: { passwordChanged: true },
        }),
        prisma,
      );
    });

    it("rejects missing or expired reset tokens", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: "invalid-token",
          password: "StrongPassword123!",
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.userAccount.updateMany).not.toHaveBeenCalled();
      expect(mockAuditService.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("resendActivation", () => {
    it("replaces the activation token and emails the Person", async () => {
      prisma.userAccount.findFirst.mockResolvedValue({
        personId: mockUser.personId,
        active: true,
        mustChangePassword: true,
        password: null,
        person: {
          email: "juan@test.com",
          firstName: "Juan",
          lastName: "Perez",
        },
      });

      await service.resendActivation({ email: " JUAN@TEST.COM " });

      expect(prisma.userAccount.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { person: { is: { email: "juan@test.com" } } },
        }),
      );
      expect(prisma.userAccount.update).toHaveBeenCalledWith({
        where: { personId: mockUser.personId },
        data: {
          activationToken: expect.any(String),
          activationTokenExpiresAt: expect.any(Date),
        },
      });
      expect(mockEmailService.sendUserActivationEmail).toHaveBeenCalledWith(
        "juan@test.com",
        "Juan Perez",
        expect.stringContaining("token="),
      );
    });

    it("returns not found when no pending user exists", async () => {
      prisma.userAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.resendActivation({ email: "missing@test.com" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects resending to an activated account", async () => {
      prisma.userAccount.findFirst.mockResolvedValue({
        ...mockUser,
        person: { ...mockUser.person },
      });

      await expect(
        service.resendActivation({ email: "juan@test.com" }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
