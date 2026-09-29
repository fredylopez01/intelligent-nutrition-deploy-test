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
  userBranch: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test } = await import("@nestjs/testing");
const { BadRequestException, ConflictException, NotFoundException } =
  await import("@nestjs/common");
const { ConfigService } = await import("@nestjs/config");
const { UsersService } = await import("./users.service.js");
const { PrismaService } =
  await import("../../database/prisma/prisma.service.js");
const { EmailService } = await import("../email/email.service.js");
const { PersonsService } = await import("../persons/persons.service.js");
const { AuditService } = await import("../audit/audit.service.js");

const configMock = {
  get: jest.fn((key: string, defaultValue?: unknown) =>
    key === "FRONTEND_URL" ? "https://frontend.test" : defaultValue,
  ),
};
const emailMock = {
  sendUserActivationEmail: jest.fn<(...args: any[]) => Promise<void>>(),
};
const personsMock = {
  create: jest.fn<(...args: any[]) => Promise<string>>(),
  findAvailableForUserAccount: jest.fn<(...args: any[]) => Promise<string>>(),
  update: jest.fn<(...args: any[]) => Promise<void>>(),
};
const auditMock = {
  createAuditLog: jest.fn<(...args: any[]) => Promise<any>>(),
};
const currentAdmin = {
  id: "admin-person-id",
  active: true,
  role: { name: "SUPERADMIN" },
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
      Array.isArray(operation) ? Promise.all(operation) : operation(prismaMock),
    );
    prismaMock.role.findUnique.mockResolvedValue(role);
    prismaMock.userAccount.findFirst.mockResolvedValue(null);
    prismaMock.branch.findMany.mockResolvedValue([]);
    prismaMock.userBranch.findFirst.mockResolvedValue(null);
    prismaMock.userBranch.create.mockResolvedValue({});
    prismaMock.userBranch.update.mockResolvedValue({});
    prismaMock.userBranch.updateMany.mockResolvedValue({ count: 1 });
    personsMock.create.mockResolvedValue("person-uuid-1");
    personsMock.findAvailableForUserAccount.mockResolvedValue("person-uuid-1");
    personsMock.update.mockResolvedValue({
      ...userRecord.person,
      phone: "5551234",
      address: null,
    });
    prismaMock.person.findUnique.mockResolvedValue(userRecord.person);
    auditMock.createAuditLog.mockResolvedValue({});
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
        { provide: PersonsService, useValue: personsMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it("creates a Person and UserAccount transactionally", async () => {
    const result = await service.create(
      {
        person: {
          firstName: " Juan ",
          lastName: " Perez ",
          email: " JUAN@EXAMPLE.COM ",
          documentTypeId: "document-type-uuid",
          documentNumber: " 12345 ",
        },
        roleId: role.id,
        branchIds: [],
      },
      currentAdmin,
    );

    expect(personsMock.create).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ documentNumber: " 12345 " }),
      "juan@example.com",
    );
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
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        entity: "USER",
        entityId: "person-uuid-1",
        reason: expect.stringContaining("Creación de cuenta"),
      }),
      prismaMock,
    );
  });

  it("associates an existing Person without duplicating it", async () => {
    await service.create(
      { personId: "person-uuid-1", roleId: role.id },
      currentAdmin,
    );

    expect(personsMock.findAvailableForUserAccount).toHaveBeenCalledWith(
      prismaMock,
      "person-uuid-1",
    );
    expect(prismaMock.userAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personId: "person-uuid-1" }),
      }),
    );
  });

  it("requires exactly one Person source", async () => {
    await expect(
      service.create(
        {
          personId: "person-uuid-1",
          person: {
            firstName: "Juan",
            lastName: "Perez",
            email: "juan@example.com",
          },
          roleId: role.id,
        },
        currentAdmin,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects inactive roles", async () => {
    prismaMock.role.findUnique.mockResolvedValue({ ...role, active: false });

    await expect(
      service.create(
        { personId: "person-uuid-1", roleId: role.id },
        currentAdmin,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects associating a Person that already has an account", async () => {
    personsMock.findAvailableForUserAccount.mockRejectedValue(
      new ConflictException("Person already has a user account"),
    );

    await expect(
      service.create(
        { personId: "person-uuid-1", roleId: role.id },
        currentAdmin,
      ),
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
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
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
    prismaMock.person.findUnique.mockResolvedValueOnce({
      ...userRecord.person,
      phone: "5550000",
      address: "Calle 1",
    });
    personsMock.update.mockResolvedValueOnce({
      ...userRecord.person,
      phone: "5551234",
      address: "Calle 2",
    });

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

    expect(personsMock.update).toHaveBeenCalledWith(
      prismaMock,
      "person-uuid-1",
      { firstName: " Juan Carlos " },
    );
    expect(prismaMock.userAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: "person-uuid-1" },
        data: { active: false },
      }),
    );
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DEACTIVATE",
        entityId: "person-uuid-1",
      }),
      prismaMock,
    );
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        oldData: {
          person: expect.objectContaining({
            phone: "5550000",
            address: "Calle 1",
          }),
        },
        newData: {
          person: expect.objectContaining({
            phone: "5551234",
            address: "Calle 2",
          }),
        },
      }),
      prismaMock,
    );
  });

  it("audits branch assignment and unassignment through the user PATCH", async () => {
    const branch = { id: "branch-uuid", name: "Sede Norte" };
    prismaMock.branch.findMany.mockResolvedValueOnce([branch]);
    prismaMock.userAccount.findUnique
      .mockResolvedValueOnce(userRecord)
      .mockResolvedValueOnce({
        ...userRecord,
        branchAssignments: [{ branch }],
      });

    await service.update(
      "person-uuid-1",
      { branchIds: [branch.id] },
      currentAdmin,
    );

    expect(prismaMock.userBranch.create).toHaveBeenCalledWith({
      data: {
        userId: "person-uuid-1",
        branchId: branch.id,
        assignmentDate: expect.any(Date),
      },
    });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ASSIGN",
        entityId: "person-uuid-1",
        newData: { branchId: branch.id, branchName: branch.name },
      }),
      prismaMock,
    );

    auditMock.createAuditLog.mockClear();
    prismaMock.userAccount.findUnique
      .mockResolvedValueOnce({
        ...userRecord,
        branchAssignments: [{ branch }],
      })
      .mockResolvedValueOnce(userRecord);

    await service.update("person-uuid-1", { branchIds: [] }, currentAdmin);

    expect(prismaMock.userBranch.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "person-uuid-1",
        branchId: { in: [branch.id] },
        active: true,
      },
      data: { active: false, endDate: expect.any(Date) },
    });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UNASSIGN",
        entityId: "person-uuid-1",
        oldData: { branchId: branch.id, branchName: branch.name },
      }),
      prismaMock,
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
