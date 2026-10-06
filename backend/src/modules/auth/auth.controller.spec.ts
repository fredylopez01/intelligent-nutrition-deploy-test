import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";

jest.unstable_mockModule("argon2", () => ({
  verify: jest.fn(),
  hash: jest.fn(),
}));

const argon2 = await import("argon2");
const { Test } = await import("@nestjs/testing");
const { ValidationPipe, Module: NestModule } = await import("@nestjs/common");
const { AuthController } = await import("./auth.controller.js");
const { AuthService } = await import("./auth.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { ConfigModule } = await import("@nestjs/config");
const { Reflector, APP_GUARD } = await import("@nestjs/core");
const { PassportModule } = await import("@nestjs/passport");
const { JwtModule } = await import("@nestjs/jwt");
const { JwtAuthGuard } = await import("../../common/guards/jwt-auth.guard.js");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const { JwtStrategy } = await import("./strategies/jwt.strategy.js");
const request = (await import("supertest")).default;

const mockPrismaService = {
  userAccount: {
    findFirst: jest.fn<(...args: any[]) => Promise<any>>(),
    findUnique: jest.fn<(...args: any[]) => Promise<any>>(),
    update: jest.fn<(...args: any[]) => Promise<any>>(),
    updateMany: jest.fn<(...args: any[]) => Promise<any>>(),
  },
  $transaction: jest.fn(),
};
mockPrismaService.$transaction.mockImplementation((operation: any) =>
  operation(mockPrismaService),
);

const { EmailService } = await import("../email/email.service.js");
const { ConfigService } = await import("@nestjs/config");
const { AuditService } = await import("../audit/audit.service.js");

const mockEmailService = {
  sendUserActivationEmail: jest.fn<(...args: any[]) => Promise<any>>(),
  sendPasswordResetEmail: jest.fn<(...args: any[]) => Promise<any>>(),
};
const mockAuditService = {
  createAuditLog: jest.fn<(...args: any[]) => Promise<any>>(),
};

@NestModule({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: any) => ({
        secret: configService.get("JWT_SECRET", "test-secret"),
        signOptions: { expiresIn: configService.get("JWT_EXPIRES_IN", "15m") },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: PrismaService, useValue: mockPrismaService },
    { provide: EmailService, useValue: mockEmailService },
    { provide: AuditService, useValue: mockAuditService },
    Reflector,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class TestAuthModule {}

describe("AuthController (e2e)", () => {
  let app: any;

  const mockRole = { id: "role-uuid-1", name: "SUPERADMIN", active: true };

  const mockUser = {
    personId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    password: "hashed",
    roleId: "role-uuid-1",
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    role: mockRole,
    person: {
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      firstName: "Juan",
      lastName: "Perez",
      email: "juan@test.com",
      active: true,
    },
    branchAssignments: [],
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-key";
    process.env.JWT_EXPIRES_IN = "15m";
    process.env.FRONTEND_URL = "https://frontend.test";
    process.env.PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES = "60";

    const moduleFixture = await Test.createTestingModule({
      imports: [TestAuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /auth/login", () => {
    it("should return 201 with accessToken on valid credentials", async () => {
      mockPrismaService.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      mockPrismaService.userAccount.update.mockResolvedValue(mockUser);

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "password123" })
        .expect(200);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).not.toHaveProperty("expiresIn");
      expect(response.body).toMatchObject({
        tokenType: "Bearer",
        user: {
          id: mockUser.personId,
          personId: mockUser.personId,
          role: { id: mockRole.id, name: mockRole.name },
          mustChangePassword: false,
        },
      });
    });

    it("should return 401 when email does not exist", async () => {
      mockPrismaService.userAccount.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "noexiste@test.com", password: "password123" })
        .expect(401);
    });

    it("should return 401 when password is wrong", async () => {
      mockPrismaService.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(false);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "wrongpassword" })
        .expect(401);
    });

    it("should return 403 when user is inactive", async () => {
      mockPrismaService.userAccount.findFirst.mockResolvedValue({
        ...mockUser,
        active: false,
      });

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "password123" })
        .expect(403);
    });

    it("should return 400 when email is missing", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ password: "password123" })
        .expect(400);
    });

    it("should return 400 when password is missing", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com" })
        .expect(400);
    });

    it("should return 400 when email is invalid", async () => {
      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "not-an-email", password: "password123" })
        .expect(400);
    });
  });

  describe("GET /auth/me", () => {
    it("should return 401 when no token is provided", async () => {
      await request(app.getHttpServer()).get("/auth/me").expect(401);
    });

    it("should return 401 when token is invalid", async () => {
      await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);
    });

    it("should return user data when token is valid", async () => {
      mockPrismaService.userAccount.findFirst.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      mockPrismaService.userAccount.update.mockResolvedValue(mockUser);

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "password123" })
        .expect(200);

      mockPrismaService.userAccount.findUnique.mockResolvedValue(mockUser);

      const meRes = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", `Bearer ${response.body.accessToken}`)
        .expect(200);

      expect(meRes.body.person.email).toBe("juan@test.com");
      expect(meRes.body.person.firstName).toBe("Juan");
      expect(meRes.body.role.name).toBe("SUPERADMIN");
      expect(meRes.body).not.toHaveProperty("password");
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("returns a generic success message and emails the reset link", async () => {
      mockPrismaService.userAccount.findFirst.mockResolvedValue({
        personId: mockUser.personId,
        person: {
          email: mockUser.person.email,
          firstName: "Juan",
          lastName: "Perez",
        },
      });
      mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const response = await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: "JUAN@test.com" })
        .expect(200);

      expect(response.body.message).toContain(
        "If an account with that email exists",
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.person.email,
        "Juan Perez",
        expect.stringContaining("/reset-password?token="),
        60,
      );
    });

    it("returns the same message when no account exists", async () => {
      mockPrismaService.userAccount.findFirst.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post("/auth/forgot-password")
        .send({ email: "missing@test.com" })
        .expect(200);

      expect(response.body.message).toContain(
        "If an account with that email exists",
      );
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe("POST /auth/reset-password", () => {
    it("resets the password, consumes the token and records the audit event", async () => {
      mockPrismaService.userAccount.findUnique.mockResolvedValue({
        personId: mockUser.personId,
        active: true,
        mustChangePassword: false,
        passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      mockPrismaService.userAccount.updateMany.mockResolvedValue({ count: 1 });
      (argon2.hash as any).mockResolvedValue("new-password-hash");

      const response = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: "valid-reset-token", password: "StrongPassword123!" })
        .expect(200);

      expect(response.body.message).toBe("Password reset successfully.");
      expect(mockPrismaService.userAccount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: "new-password-hash",
            passwordResetToken: null,
            passwordResetTokenExpiresAt: null,
          }),
        }),
      );
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PASSWORD_RESET" }),
        mockPrismaService,
      );
    });

    it("rejects weak passwords", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/reset-password")
        .send({ token: "valid-reset-token", password: "weakpass" })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Password must contain"),
        ]),
      );
    });
  });
});
