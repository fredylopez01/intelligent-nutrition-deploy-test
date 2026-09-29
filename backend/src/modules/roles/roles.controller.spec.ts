import {
  jest,
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
} from "@jest/globals";
import { INestApplication } from "@nestjs/common";

process.env.JWT_SECRET = "test-secret";
let authenticatedRoleName = "SUPERADMIN";

const { Test } = await import("@nestjs/testing");
const { ValidationPipe, Module } = await import("@nestjs/common");
const { ConfigModule } = await import("@nestjs/config");
const { PassportModule } = await import("@nestjs/passport");
const { JwtModule, JwtService } = await import("@nestjs/jwt");
const { RolesController } = await import("./roles.controller.js");
const { RolesService } = await import("./roles.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
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
  controllers: [RolesController],
  providers: [
    RolesService,
    Reflector,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    {
      provide: PrismaService,
      useValue: {
        role: {
          findUnique: jest.fn(),
          create: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
        },
        userAccount: {
          count: jest.fn<(...args: any[]) => Promise<any>>(),
          findUnique: jest
            .fn<(...args: any[]) => Promise<any>>()
            .mockImplementation(async () => ({
              personId: "user-uuid-1",
              roleId: "role-uuid-1",
              active: true,
              mustChangePassword: false,
              person: {
                id: "user-uuid-1",
                firstName: "Admin",
                lastName: "",
                email: "admin@test.com",
                active: true,
              },
              role: {
                id: "role-uuid-1",
                name: authenticatedRoleName,
                active: true,
              },
              branchAssignments: [],
            })),
        },
      },
    },
  ],
})
class TestRolesModule {}

describe("RolesController (e2e)", () => {
  let app: INestApplication;
  let prisma: any;
  let jwtService: any;

  const mockUser = {
    id: "user-uuid-1",
    email: "admin@test.com",
    roleId: "role-uuid-1",
    role: { id: "role-uuid-1", name: "SUPERADMIN" },
  };

  const mockRole = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    name: "LIDER SEDE",
    description: "Líder de sede",
    createdAt: "2026-09-14T03:07:44.280Z",
    updatedAt: "2026-09-14T03:07:44.280Z",
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [TestRolesModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    authenticatedRoleName = "SUPERADMIN";
    prisma.role.findUnique.mockReset();
    prisma.role.findUnique.mockResolvedValue(mockRole);
    prisma.role.findMany.mockReset();
    prisma.role.create.mockReset();
    prisma.role.update.mockReset();
  });

  describe("PATCH /roles/:id", () => {
    it("should return 401 when no token is provided", async () => {
      await request(app.getHttpServer())
        .patch(`/roles/${mockRole.id}`)
        .send({ name: "LIDER SEDE" })
        .expect(401);
    });

    it("should update a role and return 200 when token is valid", async () => {
      authenticatedRoleName = "DEV";
      prisma.role.findUnique.mockResolvedValue(mockRole);
      prisma.role.update.mockResolvedValue(mockRole);

      const token = jwtService.sign({ sub: mockUser.id });

      const response = await request(app.getHttpServer())
        .patch(`/roles/${mockRole.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "LIDER SEDE", description: "Líder de sede actualizado" })
        .expect(200);
      expect(response.body.name).toBe("LIDER SEDE");
    });

    it("should return 404 when role does not exist", async () => {
      authenticatedRoleName = "DEV";
      prisma.role.findUnique.mockResolvedValue(null);

      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .patch("/roles/00000000-0000-0000-0000-000000000001")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "NEW NAME" })
        .expect(404);
    });
    it("should return 409 when name is already in use", async () => {
      authenticatedRoleName = "DEV";
      const otherRole = { id: "role-uuid-2", name: "AYUDANTE" };
      prisma.role.findUnique
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(otherRole);

      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .patch(`/roles/${mockRole.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "AYUDANTE" })
        .expect(409);
    });

    it("should return 400 when name is empty string", async () => {
      authenticatedRoleName = "DEV";
      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .patch(`/roles/${mockRole.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "" })
        .expect(400);
    });

    it("should return 400 when name exceeds 50 characters", async () => {
      authenticatedRoleName = "DEV";
      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .patch(`/roles/${mockRole.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "A".repeat(51) })
        .expect(400);
    });

    it("should return 400 when description exceeds 255 characters", async () => {
      authenticatedRoleName = "DEV";
      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .patch(`/roles/${mockRole.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ description: "A".repeat(256) })
        .expect(400);
    });

    it("should return 400 when name is not a string", async () => {
      authenticatedRoleName = "DEV";
      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .patch("/roles/role-uuid-1")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: 123 })
        .expect(400);
    });
  });

  describe("POST /roles", () => {
    it("should return 401 when no token is provided", async () => {
      await request(app.getHttpServer())
        .post("/roles")
        .send({ name: "NEW ROLE" })
        .expect(401);
    });

    it("should create a role and return 201 when token is valid", async () => {
      authenticatedRoleName = "DEV";
      const newRole = {
        id: "role-uuid-2",
        name: "NEW ROLE",
        description: "Nuevo rol",
      };
      prisma.role.findUnique.mockResolvedValue(null);
      prisma.role.create.mockResolvedValue(newRole);

      const token = jwtService.sign({ sub: mockUser.id });

      const response = await request(app.getHttpServer())
        .post("/roles")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "NEW ROLE", description: "Nuevo rol" })
        .expect(201);

      expect(response.body.name).toBe("NEW ROLE");
    });

    it("should deny role mutations to SUPERADMIN", async () => {
      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .post("/roles")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "NEW ROLE" })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/roles/${mockRole.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ description: "Updated description" })
        .expect(403);
    });
  });

  describe("GET /roles", () => {
    it("should return 401 when no token is provided", async () => {
      await request(app.getHttpServer()).get("/roles").expect(401);
    });

    it("should return all roles when token is valid", async () => {
      const roles = [mockRole, { id: "role-uuid-2", name: "AYUDANTE" }];
      prisma.role.findMany.mockResolvedValue(roles);

      const token = jwtService.sign({ sub: mockUser.id });

      const response = await request(app.getHttpServer())
        .get("/roles")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe("LIDER SEDE");
    });
  });

  describe("undocumented physical deletion", () => {
    it("does not expose DELETE /roles/:id", async () => {
      const token = jwtService.sign({ sub: mockUser.id });

      await request(app.getHttpServer())
        .delete("/roles/role-uuid-1")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });
});
