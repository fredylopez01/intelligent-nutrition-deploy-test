import { jest, describe, beforeAll, afterAll, it, expect } from "@jest/globals";

const { Test } = await import("@nestjs/testing");
const { ValidationPipe } = await import("@nestjs/common");
const { ConfigModule, ConfigService } = await import("@nestjs/config");
const { UsersModule } = await import("./users.module.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { EmailService } = await import("../email/email.service.js");
const request = (await import("supertest")).default;

describe("UsersController (e2e)", () => {
  let app: any;
  let prisma: any;

  const mockRole = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    name: "SUPERADMIN",
  };

  const mockUser = {
    id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    fullName: "Juan Pérez",
    email: "juan@test.com",
    roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    active: true,
    mustChangePassword: true,
    createdAt: "2026-09-14T03:07:44.280Z",
  };

  beforeAll(async () => {
    const mockPrisma = {
      userAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
    };

    const mockConfigService = {
      get: jest.fn<(...args: any[]) => any>().mockReturnValue(4320),
    };

    const mockEmailService = {
      sendUserActivationEmail: jest
        .fn<(...args: any[]) => Promise<any>>()
        .mockResolvedValue(undefined),
    };

    const moduleFixture = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), UsersModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .overrideProvider(EmailService)
      .useValue(mockEmailService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = mockPrisma;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe("POST /users", () => {
    it("should create a user and return 201", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.userAccount.create.mockResolvedValue(mockUser);

      const response = await request(app.getHttpServer())
        .post("/users")
        .send({
          fullName: "Juan Pérez",
          email: "juan@test.com",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(201);

      expect(response.body).toEqual(mockUser);
      expect(response.body).not.toHaveProperty("passwordHash");
      expect(response.body.email).toBe("juan@test.com");
      expect(response.body.fullName).toBe("Juan Pérez");
      expect(response.body.roleId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
      expect(response.body.active).toBe(true);
      expect(response.body.mustChangePassword).toBe(true);
      expect(prisma.userAccount.create).toHaveBeenCalledTimes(1);
      expect(prisma.userAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "juan@test.com",
            fullName: "Juan Pérez",
            roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            passwordHash: null,
            mustChangePassword: true,
          }),
        }),
      );
    });

    it("should return 409 when email already exists", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(mockUser);

      await request(app.getHttpServer())
        .post("/users")
        .send({
          fullName: "Juan Pérez",
          email: "juan@test.com",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(409);
    });

    it("should return 404 when role does not exist", async () => {
      prisma.userAccount.findUnique.mockResolvedValue(null);
      prisma.role.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post("/users")
        .send({
          fullName: "Juan Pérez",
          email: "new@test.com",
          roleId: "00000000-0000-0000-0000-000000000000",
        })
        .expect(404);
    });

    it("should return 400 when email is missing", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .send({
          fullName: "Juan Pérez",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when roleId is missing", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .send({
          fullName: "Juan Pérez",
          email: "juan@test.com",
        })
        .expect(400);
    });

    it("should return 400 when email is invalid", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .send({
          fullName: "Juan Pérez",
          email: "not-an-email",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when fullName exceeds 150 characters", async () => {
      await request(app.getHttpServer())
        .post("/users")
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
        .send({
          fullName: "Juan Pérez",
          email: "juan@test.com",
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          password: "password123",
        })
        .expect(400);
    });
  });
});
