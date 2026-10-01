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
  createAuditLog: jest
    .fn<(input: unknown, transaction?: unknown) => Promise<unknown>>()
    .mockResolvedValue({}),
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
  person: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  role: { findUnique: jest.fn() },
  branch: { findMany: jest.fn() },
  userBranch: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
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
    { provide: PrismaService, useValue: mockPrisma },
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

describe("Users audit log generation (e2e)", () => {
  let app: INestApplication;
  let prisma: any;
  let jwtService: any;
  let token: string;

  const adminId = "admin-uuid-1";
  const userId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const roleId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const newRoleId = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
  const branchId = "c3d4e5f6-a7b8-4012-9def-123456789012";

  const mockAdmin = {
    id: adminId,
    personId: adminId,
    fullName: "Admin",
    email: "admin@test.com",
    roleId,
    active: true,
    mustChangePassword: false,
    person: {
      id: adminId,
      firstName: "Admin",
      lastName: "",
      email: "admin@test.com",
      active: true,
    },
    role: { id: roleId, name: "SUPERADMIN", active: true },
    branchAssignments: [],
  };

  const mockRole = { id: roleId, name: "SUPERADMIN", active: true };
  const mockNewRole = { id: newRoleId, name: "LIDER SEDE", active: true };
  const mockBranch = { id: branchId, name: "Sede Centro" };

  const mockUser = {
    personId: userId,
    person: {
      id: userId,
      firstName: "Juan",
      lastName: "Perez",
      email: "juan@test.com",
    },
    active: true,
    mustChangePassword: true,
    lastLoginAt: null,
    createdAt: "2026-09-14T03:07:44.280Z",
    updatedAt: "2026-09-14T03:07:44.280Z",
    role: { id: roleId, name: "SUPERADMIN" },
    branchAssignments: [],
  };

  const auditInputs = () =>
    mockAuditService.createAuditLog.mock.calls.map(
      ([input]: any[]) => input,
    ) as any[];

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
    token = jwtService.sign({ sub: adminId });
  });

  beforeEach(() => {
    prisma.userAccount.findUnique.mockReset();
    prisma.userAccount.findUnique.mockResolvedValue(mockAdmin);
    prisma.userAccount.findFirst.mockReset();
    prisma.userAccount.findFirst.mockResolvedValue(null);
    prisma.userAccount.create.mockReset();
    prisma.userAccount.create.mockResolvedValue(mockUser);
    prisma.userAccount.update.mockReset();
    prisma.userAccount.update.mockResolvedValue(mockUser);
    prisma.person.findUnique.mockReset();
    prisma.person.create.mockReset();
    prisma.person.create.mockResolvedValue({ id: userId });
    prisma.person.update.mockReset();
    prisma.role.findUnique.mockReset();
    prisma.role.findUnique.mockResolvedValue(mockRole);
    prisma.branch.findMany.mockReset();
    prisma.branch.findMany.mockResolvedValue([]);
    prisma.userBranch.findFirst.mockReset();
    prisma.userBranch.findFirst.mockResolvedValue(null);
    prisma.userBranch.create.mockReset();
    prisma.userBranch.create.mockResolvedValue({});
    prisma.userBranch.update.mockReset();
    prisma.userBranch.updateMany.mockReset();
    prisma.userBranch.updateMany.mockResolvedValue({ count: 0 });
    mockAuditService.createAuditLog.mockReset();
    mockAuditService.createAuditLog.mockResolvedValue({});
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe("POST /users — CREATE", () => {
    it("records exactly one CREATE audit log with reason and new values", async () => {
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "juan@test.com",
          },
          roleId,
          branchIds: [],
        })
        .expect(201);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(1);
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE",
          entity: "USER",
          entityId: userId,
          userId: adminId,
          reason: expect.stringContaining("Creación de cuenta"),
          newData: expect.objectContaining({
            person: expect.objectContaining({ email: "juan@test.com" }),
            role: expect.objectContaining({ id: roleId }),
            active: true,
          }),
        }),
        mockPrisma,
      );

      const [input] = auditInputs();
      expect(input.reason.trim().length).toBeGreaterThan(0);
    });

    it("records one CREATE plus one ASSIGN audit log per assigned branch", async () => {
      prisma.branch.findMany.mockResolvedValueOnce([mockBranch]);

      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "juan@test.com",
          },
          roleId,
          branchIds: [branchId],
        })
        .expect(201);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(2);

      const [createInput, assignInput] = auditInputs();
      expect(createInput).toMatchObject({
        action: "CREATE",
        entity: "USER",
        entityId: userId,
        newData: expect.objectContaining({
          branches: [{ id: branchId, name: "Sede Centro" }],
        }),
      });
      expect(assignInput).toMatchObject({
        action: "ASSIGN",
        entity: "USER",
        entityId: userId,
        newData: { branchId, branchName: "Sede Centro" },
      });
      expect(createInput.reason.trim().length).toBeGreaterThan(0);
      expect(assignInput.reason.trim().length).toBeGreaterThan(0);
    });

    it("does not write an audit log when creation fails", async () => {
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
          roleId,
          branchIds: [],
        })
        .expect(409);

      expect(mockAuditService.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /users/:id — UPDATE person", () => {
    it("records an UPDATE audit log with before and after person values", async () => {
      const oldPerson = {
        id: userId,
        firstName: "Juan",
        lastName: "Perez",
        email: "juan@test.com",
        phone: null,
        address: null,
      };
      const updatedPerson = {
        ...oldPerson,
        firstName: "Juan Carlos",
      };

      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockUser);
      prisma.person.findUnique.mockResolvedValueOnce(oldPerson);
      prisma.person.update.mockResolvedValueOnce(updatedPerson);

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ person: { firstName: "Juan Carlos" } })
        .expect(200);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(1);
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          entity: "USER",
          entityId: userId,
          userId: adminId,
          reason: expect.stringContaining("Actualización de datos personales"),
          oldData: { person: oldPerson },
          newData: {
            person: {
              id: userId,
              firstName: "Juan Carlos",
              lastName: "Perez",
              email: "juan@test.com",
              phone: null,
              address: null,
            },
          },
        }),
        mockPrisma,
      );

      const [input] = auditInputs();
      expect(input.reason.trim().length).toBeGreaterThan(0);
    });
  });

  describe("PATCH /users/:id/status — ACTIVATE and DEACTIVATE", () => {
    it("records a DEACTIVATE audit log with before and after status", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce({ ...mockUser, active: true });
      prisma.userAccount.update.mockResolvedValueOnce({
        ...mockUser,
        active: false,
      });

      await request(app.getHttpServer())
        .patch(`/users/${userId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: false })
        .expect(200);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(1);
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DEACTIVATE",
          entity: "USER",
          entityId: userId,
          userId: adminId,
          reason: expect.stringContaining("Desactivación"),
          oldData: { active: true },
          newData: { active: false },
        }),
        mockPrisma,
      );
    });

    it("records an ACTIVATE audit log with before and after status", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce({ ...mockUser, active: false });
      prisma.userAccount.update.mockResolvedValueOnce({
        ...mockUser,
        active: true,
      });

      await request(app.getHttpServer())
        .patch(`/users/${userId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: true })
        .expect(200);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(1);
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ACTIVATE",
          entity: "USER",
          entityId: userId,
          userId: adminId,
          reason: expect.stringContaining("Activación"),
          oldData: { active: false },
          newData: { active: true },
        }),
        mockPrisma,
      );
    });

    it("does not write an audit log when the status does not change", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce({ ...mockUser, active: true });

      await request(app.getHttpServer())
        .patch(`/users/${userId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ active: true })
        .expect(200);

      expect(mockAuditService.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /users/:id — ROLE_ASSIGNMENT", () => {
    it("records a ROLE_ASSIGNMENT audit log with before and after role", async () => {
      const updatedUser = {
        ...mockUser,
        role: { id: newRoleId, name: "LIDER SEDE" },
      };

      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);
      prisma.role.findUnique.mockResolvedValueOnce(mockNewRole);
      prisma.userAccount.update.mockResolvedValueOnce(updatedUser);

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId: newRoleId })
        .expect(200);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(1);
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "ROLE_ASSIGNMENT",
          entity: "USER",
          entityId: userId,
          userId: adminId,
          reason: expect.stringContaining("Cambio de rol"),
          oldData: { role: { id: roleId, name: "SUPERADMIN" } },
          newData: { role: { id: newRoleId, name: "LIDER SEDE" } },
        }),
        mockPrisma,
      );

      const [input] = auditInputs();
      expect(input.reason.trim().length).toBeGreaterThan(0);
    });

    it("does not write an audit log when the role is unchanged", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ roleId })
        .expect(200);

      expect(mockAuditService.createAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /users/:id — branch assignment (HS-049 + HS-054)", () => {
    it("records exactly one ASSIGN audit log with a non-empty reason", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(mockUser);
      prisma.branch.findMany.mockResolvedValueOnce([mockBranch]);

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ branchIds: [branchId] })
        .expect(200);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(1);

      const [input] = auditInputs();
      expect(input).toMatchObject({
        action: "ASSIGN",
        entity: "USER",
        entityId: userId,
        userId: adminId,
        newData: { branchId, branchName: "Sede Centro" },
      });
      expect(typeof input.reason).toBe("string");
      expect(input.reason.trim().length).toBeGreaterThan(0);
      expect(prisma.userBranch.create).toHaveBeenCalledTimes(1);
    });

    it("records exactly one UNASSIGN audit log when a branch is removed", async () => {
      const userWithBranch = {
        ...mockUser,
        branchAssignments: [{ branch: mockBranch }],
      };

      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(userWithBranch)
        .mockResolvedValueOnce(userWithBranch)
        .mockResolvedValueOnce(userWithBranch);
      prisma.branch.findMany.mockResolvedValueOnce([]);

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ branchIds: [] })
        .expect(200);

      expect(mockAuditService.createAuditLog).toHaveBeenCalledTimes(1);

      const [input] = auditInputs();
      expect(input).toMatchObject({
        action: "UNASSIGN",
        entity: "USER",
        entityId: userId,
        userId: adminId,
        oldData: { branchId, branchName: "Sede Centro" },
      });
      expect(input.reason.trim().length).toBeGreaterThan(0);
      expect(prisma.userBranch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, branchId: { in: [branchId] }, active: true },
          data: expect.objectContaining({ active: false }),
        }),
      );
    });

    it("does not write an audit log when a requested branch does not exist", async () => {
      prisma.userAccount.findUnique
        .mockResolvedValueOnce(mockAdmin)
        .mockResolvedValueOnce(mockUser);
      prisma.branch.findMany.mockResolvedValueOnce([]);

      await request(app.getHttpServer())
        .patch(`/users/${userId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ branchIds: [branchId] })
        .expect(404);

      expect(mockAuditService.createAuditLog).not.toHaveBeenCalled();
    });
  });
});
