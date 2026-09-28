import { jest, describe, beforeEach, it, expect } from "@jest/globals";

const prismaMock: any = {
  userAccount: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
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

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const {
  BadRequestException,
  ConflictException,
  NotFoundException,
} = await import("@nestjs/common");
const { ConfigService } = await import("@nestjs/config");
const { UsersService } = await import("./users.service.js");
const { PrismaService } = await import(
  "../../database/prisma/prisma.service.js"
);
const { EmailService } = await import("../email/email.service.js");

const configMock = {
  get: jest.fn((key: string, defaultValue?: unknown) =>
    key === "FRONTEND_URL" ? "https://frontend.test" : defaultValue,
  ),
};
const emailMock = {
  sendUserActivationEmail: jest.fn<(...args: any[]) => Promise<void>>(),
};

describe("UsersService contract", () => {
  let service: InstanceType<typeof UsersService>;

  const role = { id: "role-uuid-1", name: "BRANCH_LEADER", active: true };
  const userRecord = {
    personId: "person-uuid-1",
    active: true,
    mustChangePassword: true,
    lastLoginAt: null,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
    person: {
      id: "person-uuid-1",
      firstName: "Juan",
      lastName: "Perez",
      email: "juan@example.com",
    },
    role,
    branchAssignments: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operation: any) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : operation(prismaMock),
    );
    prismaMock.role.findUnique.mockResolvedValue(role);
    prismaMock.userAccount.findFirst.mockResolvedValue(null);
    prismaMock.documentType.findUnique.mockResolvedValue({
      id: "document-type-uuid",
      active: true,
    });
    prismaMock.branch.findMany.mockResolvedValue([]);
    prismaMock.person.findUnique.mockResolvedValue(null);
    prismaMock.person.create.mockResolvedValue({ id: "person-uuid-1" });
    prismaMock.userAccount.create.mockResolvedValue(userRecord);
    prismaMock.userAccount.findUnique.mockResolvedValue(userRecord);
    prismaMock.userAccount.update.mockResolvedValue(userRecord);
    prismaMock.userAccount.count.mockResolvedValue(1);
    prismaMock.userAccount.findMany.mockResolvedValue([userRecord]);
    emailMock.sendUserActivationEmail.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: EmailService, useValue: emailMock },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it("creates a Person and UserAccount transactionally", async () => {
    const result = await service.create({
      person: {
        firstName: " Juan ",
        lastName: " Perez ",
        email: " JUAN@EXAMPLE.COM ",
        documentTypeId: "document-type-uuid",
        documentNumber: " 12345 ",
      },
      roleId: role.id,
      branchIds: [],
    });

    expect(prismaMock.person.create).toHaveBeenCalledWith({
      data: {
        documentTypeId: "document-type-uuid",
        documentNumber: "12345",
        firstName: "Juan",
        lastName: "Perez",
        email: "juan@example.com",
        phone: undefined,
        address: undefined,
      },
      select: { id: true },
    });
    expect(prismaMock.userAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: "person-uuid-1",
          roleId: role.id,
          password: null,
          mustChangePassword: true,
        }),
      }),
    );
    expect(result).toMatchObject({
      id: "person-uuid-1",
      personId: "person-uuid-1",
      person: { email: "juan@example.com" },
      status: "PENDING_ACTIVATION",
    });
    expect(result).not.toHaveProperty("activationToken");
    expect(emailMock.sendUserActivationEmail).toHaveBeenCalledWith(
      "juan@example.com",
      "Juan Perez",
      expect.stringContaining("token="),
    );
  });

  it("associates an existing Person without duplicating it", async () => {
    prismaMock.person.findUnique.mockResolvedValue({
      id: "person-uuid-1",
      active: true,
      email: "juan@example.com",
      userAccount: null,
    });

    await service.create({ personId: "person-uuid-1", roleId: role.id });

    expect(prismaMock.person.create).not.toHaveBeenCalled();
    expect(prismaMock.userAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: "person-uuid-1" }),
      }),
    );
  });

  it("requires exactly one Person source", async () => {
    await expect(
      service.create({
        personId: "person-uuid-1",
        person: {
          firstName: "Juan",
          lastName: "Perez",
          email: "juan@example.com",
        },
        roleId: role.id,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects inactive roles", async () => {
    prismaMock.role.findUnique.mockResolvedValue({ ...role, active: false });

    await expect(
      service.create({ personId: "person-uuid-1", roleId: role.id }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects associating a Person that already has an account", async () => {
    prismaMock.person.findUnique.mockResolvedValue({
      id: "person-uuid-1",
      active: true,
      email: "juan@example.com",
      userAccount: { personId: "person-uuid-1" },
    });

    await expect(
      service.create({ personId: "person-uuid-1", roleId: role.id }),
    ).rejects.toThrow(ConflictException);
  });

  it("applies active, search, role, and branch filters to the user list", async () => {
    const result = await service.findAll({
      page: 1,
      limit: 20,
      active: true,
      search: "Juan",
      roleId: role.id,
      branchId: "branch-uuid",
    });

    expect(prismaMock.userAccount.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        active: true,
        roleId: role.id,
        branchAssignments: { some: { branchId: "branch-uuid", active: true } },
      }),
    });
    expect(result.data[0]).toMatchObject({
      id: "person-uuid-1",
      person: { firstName: "Juan" },
      role,
      branches: [],
    });
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it("changes role by the UserAccount personId key", async () => {
    prismaMock.role.findUnique.mockResolvedValueOnce({
      id: "role-uuid-2",
      name: "SUPERADMIN",
      active: true,
    });
    prismaMock.userAccount.update.mockResolvedValue({
      ...userRecord,
      role: { id: "role-uuid-2", name: "SUPERADMIN" },
    });

    const result = await service.changeRole(
      "person-uuid-1",
      { roleId: "role-uuid-2" },
      {
        id: "admin-person-id",
        fullName: "Admin",
        email: "admin@example.com",
        roleId: "admin-role-id",
        active: true,
        role: { name: "SUPERADMIN" },
      },
    );

    expect(prismaMock.userAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { personId: "person-uuid-1" } }),
    );
    expect(result.role.name).toBe("SUPERADMIN");
  });

  it("updates account status and Person details on the existing PATCH route", async () => {
    await service.update(
      "person-uuid-1",
      { active: false, person: { firstName: " Juan Carlos " } },
      {
        id: "admin-person-id",
        fullName: "Admin",
        email: "admin@example.com",
        roleId: "admin-role-id",
        active: true,
        role: { name: "SUPERADMIN" },
      },
    );

    expect(prismaMock.userAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: "person-uuid-1" },
        data: {
          active: false,
          person: { update: { firstName: "Juan Carlos" } },
        },
      }),
    );
  });

  it("prevents self-deactivation", async () => {
    await expect(
      service.update(
        "person-uuid-1",
        { active: false },
        {
          id: "person-uuid-1",
          fullName: "Juan Perez",
          email: "juan@example.com",
          roleId: role.id,
          active: true,
          role: { name: "SUPERADMIN" },
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns not found for a missing account", async () => {
    prismaMock.userAccount.findUnique.mockResolvedValue(null);

    await expect(service.findUserById("missing-person-id")).rejects.toThrow(
      NotFoundException,
    );
  });
});