import {
  jest,
  describe,
  beforeEach,
  beforeAll,
  afterAll,
  it,
  expect,
} from "@jest/globals";
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
const { PersonsModule } = await import("../persons/persons.module.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { EmailService } = await import("../email/email.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { Reflector } = await import("@nestjs/core");
const { JwtStrategy } = await import("../auth/strategies/jwt.strategy.js");
const { JwtAuthGuard } = await import("../../common/guards/jwt-auth.guard.js");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const { APP_GUARD } = await import("@nestjs/core");
const request = (await import("supertest")).default;
const mockAuditService = {
  createAuditLog: jest.fn().mockResolvedValue({}),
  findAll: jest.fn(),
};

const mockPrisma = {
  userAccount: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  person: { findUnique: jest.fn(), create: jest.fn() },
  role: { findUnique: jest.fn() },
  documentType: { findUnique: jest.fn() },
  branch: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
mockPrisma.$transaction.mockImplementation((operation: any) =>
  Array.isArray(operation) ? Promise.all(operation) : operation(mockPrisma),
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    PersonsModule,
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
    { provide: APP_GUARD, useClass: RolesGuard },
    {
      provide: PrismaService,
      useValue: mockPrisma,
    },
    {
      provide: EmailService,
      useValue: {
        sendUserActivationEmail: jest
          .fn<(...args: any[]) => Promise<any>>()
          .mockResolvedValue(undefined),
      },
    },
    { provide: AuditService, useValue: mockAuditService },
  ],
})
class TestUsersModule {}

describe("UsersController (e2e)", () => {
  let app: INestApplication;
  let prisma: any;
  let jwtService: any;

  const mockAdmin = {
    id: "admin-uuid-1",
    personId: "admin-uuid-1",
    fullName: "Admin",
    email: "admin@test.com",
    roleId: "role-admin",
    active: true,
    mustChangePassword: false,
    person: {
      id: "admin-uuid-1",
      firstName: "Admin",
      lastName: "",
      email: "admin@test.com",
      active: true,
    },
    role: { id: "role-admin", name: "SUPERADMIN", active: true },
    branchAssignments: [],
  };

  const mockRole = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    name: "SUPERADMIN",
    active: true,
  };

  const mockUser = {
    personId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    person: {
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      firstName: "Juan",
      lastName: "Perez",
      email: "juan@test.com",
    },
    active: true,
    mustChangePassword: true,
    createdAt: "2026-09-14T03:07:44.280Z",
    role: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "SUPERADMIN" },
    branchAssignments: [],
  };

  const mockNewRole = {
    id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    name: "LIDER SEDE",
    active: true,
  };

  const mockUpdatedUser = {
    ...mockUser,
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
    prisma.userAccount.findFirst.mockReset();
    prisma.userAccount.findFirst.mockResolvedValue(null);
    prisma.userAccount.create.mockReset();
    prisma.userAccount.update.mockReset();
    prisma.role.findUnique.mockReset();
    prisma.role.findUnique.mockResolvedValue(mockRole);
    prisma.person.findUnique.mockReset();
    prisma.person.findUnique.mockResolvedValue(null);
    prisma.person.create.mockReset();
    prisma.person.create.mockResolvedValue({ id: mockUser.personId });
    prisma.branch.findMany.mockReset();
    prisma.branch.findMany.mockResolvedValue([]);
    prisma.documentType.findUnique.mockReset();
    prisma.userAccount.create.mockResolvedValue(mockUser);
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
      prisma.role.findUnique.mockResolvedValueOnce(mockRole);
      prisma.userAccount.create.mockResolvedValueOnce(mockUser);

      const response = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "juan@test.com",
          },
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          branchIds: [],
        })
        .expect(201);

      expect(response.body.id).toBe(mockUser.personId);
      expect(response.body.personId).toBe(mockUser.personId);
      expect(response.body.person.email).toBe("juan@test.com");
      expect(response.body.status).toBe("PENDING_ACTIVATION");
      expect(response.body).not.toHaveProperty("activationToken");
      expect(response.body.active).toBe(true);
      expect(response.body.mustChangePassword).toBe(true);
      expect(prisma.userAccount.create).toHaveBeenCalledTimes(1);
      expect(prisma.userAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: mockUser.personId,
            roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            password: null,
            mustChangePassword: true,
          }),
        }),
      );
    });

    it("should return 409 when email already exists", async () => {
      prisma.userAccount.findFirst.mockResolvedValueOnce(mockUser);

      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "juan@test.com",
          },
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(409);
    });

    it("should return 404 when role does not exist", async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "new@test.com",
          },
          roleId: "00000000-0000-0000-0000-000000000000",
        })
        .expect(404);
    });

    it("should return 400 when email is missing", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: { firstName: "Juan", lastName: "Perez" },
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when roleId is missing", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "juan@test.com",
          },
        })
        .expect(400);
    });

    it("should return 400 when email is invalid", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "not-an-email",
          },
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when firstName exceeds 100 characters", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "A".repeat(101),
            lastName: "Perez",
            email: "juan@test.com",
          },
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        })
        .expect(400);
    });

    it("should return 400 when forbidden fields are sent", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "juan@test.com",
          },
          roleId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          password: "password123",
        })
        .expect(400);
    });
  });

  describe("PATCH /users/:id", () => {
    let token: string;

    beforeAll(() => {
      token = jwtService.sign({ sub: "admin-uuid-1" });
    });

    it("should change user role through the documented user endpoint", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);
      prisma.role.findUnique.mockResolvedValueOnce(mockNewRole);
      prisma.userAccount.update.mockResolvedValueOnce(mockUpdatedUser);

      const response = await request(app.getHttpServer())
        .patch(`/users/${mockUser.personId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: mockNewRole.id })
        .expect(200);

      expect(response.body.role.id).toBe(mockNewRole.id);
      expect(response.body.role.name).toBe("LIDER SEDE");
    });

    it("requires authentication", async () => {
      await request(app.getHttpServer())
        .patch(`/users/${mockUser.personId}`)
        .send({ roleId: mockNewRole.id })
        .expect(401);
    });
  });
});
