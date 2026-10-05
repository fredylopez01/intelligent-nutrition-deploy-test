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
const { SuppliersController } = await import("./suppliers.controller.js");
const { SuppliersService } = await import("./suppliers.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { AuditService } = await import("../audit/audit.service.js");
const { Reflector } = await import("@nestjs/core");
const { JwtStrategy } = await import("../auth/strategies/jwt.strategy.js");
const { JwtAuthGuard } = await import("../../common/guards/jwt-auth.guard.js");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const { APP_GUARD } = await import("@nestjs/core");
const request = (await import("supertest")).default;

const mockAuditService = {
  createAuditLog: jest
    .fn<(...args: any[]) => Promise<any>>()
    .mockResolvedValue({}),
};

const mockPrisma = {
  documentType: { findUnique: jest.fn() },
  person: { findUnique: jest.fn(), create: jest.fn() },
  supplier: { create: jest.fn() },
  userAccount: { findUnique: jest.fn() },
  $transaction: jest.fn(),
};
mockPrisma.$transaction.mockImplementation((operation: any) =>
  Array.isArray(operation) ? Promise.all(operation) : operation(mockPrisma),
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.register({
      secret: "test-secret",
      signOptions: { expiresIn: "1h" },
    }),
  ],
  controllers: [SuppliersController],
  providers: [
    SuppliersService,
    Reflector,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: PrismaService, useValue: mockPrisma },
    { provide: AuditService, useValue: mockAuditService },
  ],
})
class TestSuppliersModule {}

describe("SuppliersController (e2e)", () => {
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

  const supplierRecord = {
    personId: "person-uuid-1",
    commercialName: "Distribuidora Salud SAS",
    person: {
      id: "person-uuid-1",
      documentTypeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      documentNumber: "900123456",
      firstName: null,
      lastName: null,
      businessName: "Distribuidora Salud SAS",
      email: "contacto@distribuidora.test",
      phone: "3001234567",
      address: "Calle 10 # 20-30",
    },
  };

  const validPersonPayload = {
    documentTypeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    documentNumber: "900123456",
    businessName: "Distribuidora Salud SAS",
    email: "contacto@distribuidora.test",
    phone: "3001234567",
    address: "Calle 10 # 20-30",
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [TestSuppliersModule],
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
    prisma.documentType.findUnique.mockReset();
    prisma.documentType.findUnique.mockResolvedValue({
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      active: true,
    });
    prisma.person.findUnique.mockReset();
    prisma.person.findUnique.mockResolvedValue(null);
    prisma.person.create.mockReset();
    prisma.person.create.mockResolvedValue({ id: "person-new-uuid" });
    prisma.supplier.create.mockReset();
    prisma.supplier.create.mockResolvedValue(supplierRecord);
    mockAuditService.createAuditLog.mockReset();
    mockAuditService.createAuditLog.mockResolvedValue({});
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe("POST /suppliers", () => {
    let token: string;

    beforeAll(() => {
      token = jwtService.sign({ sub: "admin-uuid-1" });
    });

    it("should create a supplier and return 201", async () => {
      const response = await request(app.getHttpServer())
        .post("/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: validPersonPayload,
          commercialName: "Distribuidora Salud SAS",
        })
        .expect(201);

      expect(response.body.id).toBe("person-uuid-1");
      expect(response.body.commercialName).toBe("Distribuidora Salud SAS");
      expect(response.body.person).toMatchObject({
        id: "person-uuid-1",
        documentNumber: "900123456",
        email: "contacto@distribuidora.test",
      });
      expect(prisma.person.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentTypeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            documentNumber: "900123456",
          }),
        }),
      );
      expect(prisma.supplier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personId: "person-new-uuid",
            commercialName: "Distribuidora Salud SAS",
          }),
        }),
      );
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE",
          entity: "SUPPLIER",
          reason: expect.stringContaining("Creación del proveedor"),
        }),
        expect.anything(),
      );
    });

    it("should return 400 when commercialName is empty", async () => {
      await request(app.getHttpServer())
        .post("/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .send({ person: validPersonPayload, commercialName: "" })
        .expect(400);

      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it("should return 400 when neither person nor personId is provided", async () => {
      const response = await request(app.getHttpServer())
        .post("/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .send({ commercialName: "Distribuidora Salud SAS" })
        .expect(400);

      expect(response.body.message).toContain(
        "Provide either person or personId, but not both",
      );
      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it("should return 409 when the NIT is already a supplier", async () => {
      const personId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      prisma.person.findUnique.mockResolvedValue({
        id: personId,
        active: true,
        supplier: { personId },
      });

      const response = await request(app.getHttpServer())
        .post("/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .send({ personId, commercialName: "Otra Razon Social" })
        .expect(409);

      expect(response.body.code).toBe("ALREADY_SUPPLIER");
      expect(response.body.message).toBe(
        "This person is already registered as a supplier.",
      );
      expect(prisma.supplier.create).not.toHaveBeenCalled();
      expect(mockAuditService.createAuditLog).not.toHaveBeenCalled();
    });

    it("should return 400 when the email format is invalid", async () => {
      const response = await request(app.getHttpServer())
        .post("/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: { ...validPersonPayload, email: "no-es-un-correo" },
          commercialName: "Distribuidora Salud SAS",
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("email")]),
      );
      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it("should return 400 when forbidden fields are sent", async () => {
      const response = await request(app.getHttpServer())
        .post("/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .send({
          person: validPersonPayload,
          commercialName: "Distribuidora Salud SAS",
          createdAt: "2026-01-01",
        })
        .expect(400);

      expect(response.body.message).toContain(
        "property createdAt should not exist",
      );
      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it("requires authentication", async () => {
      await request(app.getHttpServer())
        .post("/suppliers")
        .send({ personId: "person-uuid-1", commercialName: "Sin Token SAS" })
        .expect(401);
    });

    it("should return 403 when the role is not allowed", async () => {
      prisma.userAccount.findUnique.mockResolvedValueOnce({
        ...mockAdmin,
        role: { id: "role-2", name: "NUTRITIONIST", active: true },
      });

      const response = await request(app.getHttpServer())
        .post("/suppliers")
        .set("Authorization", `Bearer ${token}`)
        .send({
          personId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
          commercialName: "Sin Permiso SAS",
        })
        .expect(403);

      expect(response.body.code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });
  });
});
