import { jest, describe, beforeEach, beforeAll, afterAll, it, expect } from "@jest/globals";
import { INestApplication } from "@nestjs/common";

process.env.JWT_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:3000";

const { Test } = await import("@nestjs/testing");
const { ValidationPipe, Module } = await import("@nestjs/common");
const { ConfigModule } = await import("@nestjs/config");
const { PassportModule } = await import("@nestjs/passport");
const { JwtModule, JwtService } = await import("@nestjs/jwt");
const { UsersController } = await import("./users.controller.js");
const { UsersService } = await import("./users.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { EmailService } = await import("../email/email.service.js");
const { Reflector } = await import("@nestjs/core");
const { JwtStrategy } = await import("../auth/strategies/jwt.strategy.js");
const { JwtAuthGuard } = await import("../../common/guards/jwt-auth.guard.js");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const { APP_GUARD } = await import("@nestjs/core");
const request = (await import("supertest")).default;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.register({
      secret: "test-secret",
      signOptions: { expiresIn: "1h" },
    }),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    Reflector,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    {
      provide: PrismaService,
      useValue: {
        userAccount: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        role: {
          findUnique: jest.fn(),
        },
      },
    },
    {
      provide: EmailService,
      useValue: {
        sendUserActivationEmail: jest
          .fn<(...args: any[]) => Promise<any>>()
          .mockResolvedValue(undefined),
      },
    },
  ],
})
class TestUsersModule {}

describe("UsersController (e2e)", () => {
  let app: INestApplication;
  let prisma: any;
  let jwtService: any;

  const mockAdmin = {
    id: "admin-uuid-1",
    fullName: "Admin",
    email: "admin@test.com",
    roleId: "role-admin",
    active: true,
    role: { id: "role-admin", name: "SUPER ADMIN" },
  };

  const mockRole = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    name: "SUPERADMIN",
  };

  const mockUser = {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    fullName: "Juan Perez",
    email: "juan@test.com",
    roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    active: true,
    mustChangePassword: true,
    createdAt: "2026-09-14T03:07:44.280Z",
    role: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "SUPERADMIN" },
  };

  const mockNewRole = {
    id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    name: "LIDER SEDE",
    active: true,
  };

  const mockUpdatedUser = {
    ...mockUser,
    roleId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    role: { id: "b2c3d4e5-f6a7-8901-bcde-f12345678901", name: "LIDER SEDE" },
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [TestUsersModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    jwtService = moduleFixture.get(JwtService);
  });

  beforeEach(() => {
    prisma.userAccount.findUnique.mockReset();
    prisma.userAccount.findUnique.mockResolvedValue(mockAdmin);
    prisma.userAccount.create.mockReset();
    prisma.userAccount.update.mockReset();
    prisma.role.findUnique.mockReset();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe("POST /users", () => {
    let token: string;

    beforeAll(() => {
      token = jwtService.sign({ sub: "admin-uuid-1" });
    });

    it("should create a user and return 201", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(null);
      prisma.role.findUnique.mockResolvedValueOnce(mockRole);
      prisma.userAccount.create.mockResolvedValueOnce(mockUser);

      const response = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Juan Perez",
          email: "juan@test.com",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(201);

      expect(response.body).toEqual(mockUser);
      expect(response.body).not.toHaveProperty("passwordHash");
      expect(response.body.email).toBe("juan@test.com");
      expect(response.body.fullName).toBe("Juan Perez");
      expect(response.body.roleId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(response.body.active).toBe(true);
      expect(response.body.mustChangePassword).toBe(true);
      expect(prisma.userAccount.create).toHaveBeenCalledTimes(1);
      expect(prisma.userAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "juan@test.com",
            fullName: "Juan Perez",
            roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            passwordHash: null,
            mustChangePassword: true,
          }),
        }),
      );
    });

    it("should return 409 when email already exists", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);

      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Juan Perez",
          email: "juan@test.com",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(409);
    });

    it("should return 404 when role does not exist", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(null);
      prisma.role.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Juan Perez",
          email: "new@test.com",
          roleId: "00000000-0000-0000-0000-000000000000",
        })
        .expect(404);
    });

    it("should return 400 when email is missing", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Juan Perez",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when roleId is missing", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Juan Perez",
          email: "juan@test.com",
        })
        .expect(400);
    });

    it("should return 400 when email is invalid", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Juan Perez",
          email: "not-an-email",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when fullName exceeds 150 characters", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "A".repeat(151),
          email: "juan@test.com",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when forbidden fields are sent", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          fullName: "Juan Perez",
          email: "juan@test.com",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          password: "password123",
        })
        .expect(400);
    });
  });

  describe("PATCH /users/role/:id", () => {
    let token: string;

    beforeAll(() => {
      token = jwtService.sign({ sub: "admin-uuid-1" });
    });

    it("should change user role and return 200", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);
      prisma.role.findUnique.mockResolvedValueOnce(mockNewRole);
      prisma.userAccount.update.mockResolvedValueOnce(mockUpdatedUser);

      const response = await request(app.getHttpServer())
        .patch(`/users/role/${mockUser.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: mockNewRole.id })
        .expect(200);

      expect(response.body.role.id).toBe(mockNewRole.id);
      expect(response.body.role.name).toBe("LIDER SEDE");
    });

    it("should return 401 when no token is provided", async () => {
      await request(app.getHttpServer())
        .patch(`/users/role/${mockUser.id}`)
        .send({ roleId: mockNewRole.id })
        .expect(401);
    });

    it("should return 400 when roleId is missing", async () => {
      prisma.userAccount.findUnique.mockResolvedValueOnce(mockAdmin);

      await request(app.getHttpServer())
        .patch(`/users/role/${mockUser.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it("should return 400 when roleId is not a UUID", async () => {
      prisma.userAccount.findUnique.mockResolvedValueOnce(mockAdmin);

      await request(app.getHttpServer())
        .patch(`/users/role/${mockUser.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: "not-a-uuid" })
        .expect(400);
    });

    it("should return 400 when user tries to change own role", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce({
          ...mockUser,
          id: "admin-uuid-1",
          role: { id: "role-admin", name: "SUPER ADMIN" },
        });

      await request(app.getHttpServer())
        .patch("/users/role/admin-uuid-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: mockNewRole.id })
        .expect(400);
    });

    it("should return 400 when role is the same", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);

      await request(app.getHttpServer())
        .patch(`/users/role/${mockUser.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: mockUser.roleId })
        .expect(400);
    });

    it("should return 404 when user does not exist", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .patch("/users/role/11111111-1111-4111-8111-111111111111")
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: mockNewRole.id })
        .expect(404);
    });

    it("should return 404 when target role does not exist", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);
      prisma.role.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .patch(`/users/role/${mockUser.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: "00000000-0000-0000-0000-000000000000" })
        .expect(404);
    });

    it("should return 400 when target role is inactive", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);
      prisma.role.findUnique.mockResolvedValueOnce({
        id: "inactive-role",
        name: "INACTIVE",
        active: false,
      });

      await request(app.getHttpServer())
        .patch(`/users/role/${mockUser.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: "inactive-role" })
        .expect(400);
    });
  });
});
