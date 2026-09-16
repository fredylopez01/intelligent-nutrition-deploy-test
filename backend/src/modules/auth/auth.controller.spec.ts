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
}));

const argon2 = await import("argon2");
const { Test } = await import("@nestjs/testing");
const {
  INestApplication,
  ValidationPipe,
  Module: NestModule,
} = await import("@nestjs/common");
const { AuthController } = await import("./auth.controller");
const { AuthService } = await import("./auth.service");
const { PrismaService } = await import("../database/prisma/prisma.service.js");
const { JwtService } = await import("@nestjs/jwt");
const { ConfigModule, ConfigService } = await import("@nestjs/config");
const { Reflector, APP_GUARD } = await import("@nestjs/core");
const { PassportModule } = await import("@nestjs/passport");
const { JwtModule } = await import("@nestjs/jwt");
const { JwtAuthGuard } = await import("../common/guards/jwt-auth.guard");
const { RolesGuard } = await import("../common/guards/roles.guard");
const { JwtStrategy } = await import("./strategies/jwt.strategy");
const request = (await import("supertest")).default;

const mockPrismaService = {
  userAccount: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
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
    {
      provide: PrismaService,
      useValue: mockPrismaService,
    },
    Reflector,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
class TestAuthModule {}

describe("AuthController (e2e)", () => {
  let app: any;

  const mockRole = { id: "role-uuid-1", name: "SUPERADMIN" };

  const mockUser = {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    fullName: "Juan Perez",
    email: "juan@test.com",
    passwordHash: "hashed",
    roleId: "role-uuid-1",
    active: true,
    lastLoginAt: null,
    role: mockRole,
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret-key";
    process.env.JWT_EXPIRES_IN = "15m";

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
      mockPrismaService.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      mockPrismaService.userAccount.update.mockResolvedValue(mockUser);

      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "password123" })
        .expect(201);

      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("expiresIn");
    });

    it("should return 401 when email does not exist", async () => {
      mockPrismaService.userAccount.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "noexiste@test.com", password: "password123" })
        .expect(401);
    });

    it("should return 401 when password is wrong", async () => {
      mockPrismaService.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(false);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "wrongpassword" })
        .expect(401);
    });

    it("should return 401 when user is inactive", async () => {
      mockPrismaService.userAccount.findUnique.mockResolvedValue({
        ...mockUser,
        active: false,
      });

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "password123" })
        .expect(401);
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
      mockPrismaService.userAccount.findUnique.mockResolvedValue(mockUser);
      (argon2.verify as any).mockResolvedValue(true);
      mockPrismaService.userAccount.update.mockResolvedValue(mockUser);

      const loginRes = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "juan@test.com", password: "password123" })
        .expect(201);

      mockPrismaService.userAccount.findUnique.mockResolvedValue({
        id: mockUser.id,
        fullName: mockUser.fullName,
        email: mockUser.email,
        roleId: mockUser.roleId,
        active: mockUser.active,
        role: mockUser.role,
      });

      const meRes = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
        .expect(200);

      expect(meRes.body.email).toBe("juan@test.com");
      expect(meRes.body.fullName).toBe("Juan Perez");
      expect(meRes.body).not.toHaveProperty("passwordHash");
    });
  });
});
