import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../email/email.service.js";
import { CryptoUtil } from "../../common/utils/crypto.util.js";
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";
import { PaginatedUsersResponseDto } from "./dto/paginated-user-response.dto.js";
import { ChangeUserRoleDto } from "./dto/change-user-role.dto.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { PersonsService } from "../persons/persons.service.js";
import {
  AuditService,
  type AuditLogTransaction,
  type CreateAuditLogInput,
} from "../audit/audit.service.js";

const userSelect = {
  personId: true,
  active: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  person: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  role: { select: { id: true, name: true } },
  branchAssignments: {
    where: { active: true },
    select: { branch: { select: { id: true, name: true } } },
  },
};

function toUserResponse(user: any) {
  const { personId, branchAssignments = [], ...userFields } = user;
  return {
    id: personId,
    personId,
    ...userFields,
    branches: branchAssignments.map(({ branch }: any) => branch),
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly personsService: PersonsService,
    private readonly auditService: AuditService,
  ) {}

  private recordUserAudit(
    transaction: AuditLogTransaction,
    currentUser: AuthenticatedUser,
    ipAddress: string | undefined,
    event: Omit<CreateAuditLogInput, "userId" | "entity" | "ipAddress">,
  ) {
    return this.auditService.createAuditLog(
      {
        ...event,
        userId: currentUser.id,
        entity: "USER",
        ipAddress,
      },
      transaction,
    );
  }

  async getBranches(userId: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { personId: userId },
      select: {
        branchAssignments: {
          orderBy: [{ assignmentDate: "desc" }, { id: "asc" }],
          select: {
            assignmentDate: true,
            endDate: true,
            active: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user.branchAssignments.map(
      ({ branch, assignmentDate, endDate, active }) => ({
        id: branch.id,
        name: branch.name,
        assignmentDate: assignmentDate.toISOString().slice(0, 10),
        endDate: endDate?.toISOString().slice(0, 10) ?? null,
        active,
      }),
    );
  }

  async assignBranch(
    userId: string,
    branchId: string,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.userAccount.findUnique({
          where: { personId: userId },
          select: { personId: true },
        });
        if (!user) {
          throw new NotFoundException("User not found");
        }

        const branch = await transaction.branch.findUnique({
          where: { id: branchId },
          select: { id: true, name: true, active: true },
        });
        if (!branch) {
          throw new NotFoundException("Branch not found");
        }
        if (!branch.active) {
          throw new BadRequestException("Cannot assign an inactive branch");
        }

        const activeAssignment = await transaction.userBranch.findFirst({
          where: { userId, branchId, active: true },
          select: { id: true },
        });
        if (activeAssignment) {
          throw new ConflictException(
            "User is already assigned to this branch",
          );
        }

        const now = new Date();
        const assignmentDate = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const sameDayInactiveAssignment =
          await transaction.userBranch.findFirst({
            where: { userId, branchId, assignmentDate, active: false },
            select: { id: true },
          });

        const assignment = sameDayInactiveAssignment
          ? await transaction.userBranch.update({
              where: { id: sameDayInactiveAssignment.id },
              data: { active: true, endDate: null },
              select: {
                id: true,
                userId: true,
                branchId: true,
                assignmentDate: true,
                endDate: true,
                active: true,
              },
            })
          : await transaction.userBranch.create({
              data: { userId, branchId, assignmentDate, active: true },
              select: {
                id: true,
                userId: true,
                branchId: true,
                assignmentDate: true,
                endDate: true,
                active: true,
              },
            });

        await this.recordUserAudit(transaction, currentUser, ipAddress, {
          action: "ASSIGN",
          entityId: userId,
          newData: {
            branchId: branch.id,
            branchName: branch.name,
            assignmentId: assignment.id,
            assignmentDate: assignment.assignmentDate,
          },
          reason: `Asignación de la sede ${branch.name} al usuario ${userId}`,
        });

        return assignment;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("User is already assigned to this branch");
      }

      throw error;
    }
  }

  async create(
    createUserDto: CreateUserDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { person, personId, roleId, branchIds = [] } = createUserDto;
    if (Boolean(person) === Boolean(personId)) {
      throw new BadRequestException(
        "Provide either person or personId, but not both",
      );
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, active: true },
    });
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    if (!role.active) {
      throw new BadRequestException("Cannot assign an inactive role");
    }

    if (branchIds.length !== new Set(branchIds).size) {
      throw new BadRequestException("branchIds cannot contain duplicates");
    }

    const normalizedEmail = person?.email.trim().toLowerCase();
    const existingLogin = await this.prisma.userAccount.findFirst({
      where: normalizedEmail
        ? { person: { is: { email: normalizedEmail } } }
        : { personId },
      select: { personId: true },
    });
    if (existingLogin) {
      throw new ConflictException(
        normalizedEmail
          ? "Email is already registered to a user account"
          : "Person already has a user account",
      );
    }

    const rawToken = CryptoUtil.generateRandomToken();
    const activationToken = CryptoUtil.hashToken(rawToken);
    const expirationMinutes = this.configService.get<number>(
      "ACTIVATION_TOKEN_EXPIRATION_MINUTES",
      4320,
    );
    const activationTokenExpiresAt =
      CryptoUtil.getExpirationDate(expirationMinutes);

    const user = await this.prisma.$transaction(async (transaction) => {
      const branches = await transaction.branch.findMany({
        where: { id: { in: branchIds }, active: true },
        select: { id: true, name: true },
      });
      if (branches.length !== branchIds.length) {
        throw new NotFoundException(
          "One or more active branches were not found",
        );
      }

      const resolvedPersonId = person
        ? await this.personsService.create(
            transaction,
            person,
            normalizedEmail!,
          )
        : await this.personsService.findAvailableForUserAccount(
            transaction,
            personId!,
          );

      const createdUser = await transaction.userAccount.create({
        data: {
          personId: resolvedPersonId!,
          roleId,
          password: null,
          mustChangePassword: true,
          activationToken,
          activationTokenExpiresAt,
          active: true,
          branchAssignments: {
            create: branchIds.map((id) => ({
              branch: { connect: { id } },
              assignmentDate: new Date(),
            })),
          },
        },
        select: userSelect,
      });

      await this.recordUserAudit(transaction, currentUser, ipAddress, {
        action: "CREATE",
        entityId: resolvedPersonId!,
        newData: {
          person: createdUser.person,
          role: createdUser.role,
          active: createdUser.active,
          branches: branches.map(({ id, name }) => ({ id, name })),
        },
        reason: `Creación de cuenta para el usuario ${resolvedPersonId}`,
      });

      for (const branch of branches) {
        await this.recordUserAudit(transaction, currentUser, ipAddress, {
          action: "ASSIGN",
          entityId: resolvedPersonId!,
          newData: { branchId: branch.id, branchName: branch.name },
          reason: `Asignación de la sede ${branch.name} al usuario ${resolvedPersonId}`,
        });
      }

      return createdUser;
    });

    const fullName = [user.person.firstName, user.person.lastName]
      .filter(Boolean)
      .join(" ");
    const activationUrl = CryptoUtil.buildActivationUrl(
      this.configService,
      rawToken,
    );

    try {
      await this.emailService.sendUserActivationEmail(
        user.person.email!,
        fullName,
        activationUrl,
      );
    } catch (error) {
      this.logger.error(
        `User ${user.personId} created, but activation email failed`,
        error,
      );
      throw new InternalServerErrorException(
        "User was created, but the activation email could not be sent",
      );
    }

    return { ...toUserResponse(user), status: "PENDING_ACTIVATION" };
  }

  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const { page, limit, active, search, roleId, branchId } = query;
    const skip = (page - 1) * limit;
    const where = {
      ...(active === undefined ? {} : { active }),
      ...(roleId ? { roleId } : {}),
      ...(branchId
        ? { branchAssignments: { some: { branchId, active: true } } }
        : {}),
      ...(search
        ? {
            person: {
              is: {
                OR: [
                  {
                    firstName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    lastName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                  { email: { contains: search, mode: "insensitive" as const } },
                  {
                    documentNumber: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            },
          }
        : {}),
    };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.userAccount.count({ where }),
      this.prisma.userAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: userSelect,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: users.map((user) => toUserResponse(user)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findUserById(userId: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { personId: userId },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return toUserResponse(user);
  }

  async changeRole(
    userId: string,
    changeUserRoleDto: ChangeUserRoleDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { roleId } = changeUserRoleDto;

    const user = await this.findUserById(userId);

    if (user.id === currentUser.id) {
      throw new BadRequestException("You cannot change your own role");
    }

    if (user.role.id === roleId) {
      throw new BadRequestException("User already has the specified role");
    }

    const targetRole = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, active: true },
    });

    if (!targetRole) {
      throw new NotFoundException("Role not found");
    }

    if (!targetRole.active) {
      throw new BadRequestException("Cannot assign an inactive role");
    }

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      const changedUser = await transaction.userAccount.update({
        where: { personId: userId },
        data: { roleId },
        select: userSelect,
      });
      await this.recordUserAudit(transaction, currentUser, ipAddress, {
        action: "ROLE_ASSIGNMENT",
        entityId: userId,
        oldData: { role: user.role },
        newData: { role: changedUser.role },
        reason: `Asignación del rol ${targetRole.name} al usuario ${userId}`,
      });
      return changedUser;
    });

    return toUserResponse(updatedUser);
  }

  async updateStatus(
    userId: string,
    active: boolean,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    if (!["SUPERADMIN", "DEV"].includes(currentUser.role.name)) {
      throw new ForbiddenException(
        "Only SUPERADMIN or DEV can update user status",
      );
    }
    if (currentUser.id === userId && !active) {
      throw new BadRequestException("You cannot deactivate your own account");
    }

    const existingUser = await this.prisma.userAccount.findUnique({
      where: { personId: userId },
      select: { personId: true, active: true },
    });
    if (!existingUser) {
      throw new NotFoundException("User not found");
    }

    if (existingUser.active === active) {
      return { message: "User status updated successfully." };
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userAccount.update({
        where: { personId: userId },
        data: { active },
      });
      await this.recordUserAudit(transaction, currentUser, ipAddress, {
        action: active ? "ACTIVATE" : "DEACTIVATE",
        entityId: userId,
        oldData: { active: existingUser.active },
        newData: { active },
        reason: `${active ? "Activación" : "Desactivación"} de la cuenta del usuario ${userId}`,
      });
    });

    return { message: "User status updated successfully." };
  }

  async update(
    userId: string,
    updateUserDto: UpdateUserDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const isPrivileged = ["SUPERADMIN", "DEV"].includes(currentUser.role.name);
    const updatesAccount =
      updateUserDto.roleId !== undefined ||
      updateUserDto.branchIds !== undefined;
    if (currentUser.id !== userId && !isPrivileged) {
      throw new BadRequestException("You can only update your own account");
    }
    if (updatesAccount && !isPrivileged) {
      throw new BadRequestException(
        "Only SUPERADMIN or DEV can update account access",
      );
    }
    const { person, roleId, branchIds } = updateUserDto;
    const hasPersonChanges =
      person !== undefined &&
      Object.values(person).some((value) => value !== undefined);
    if (!hasPersonChanges && roleId === undefined && branchIds === undefined) {
      throw new BadRequestException("At least one field must be provided");
    }
    const existingUser = await this.findUserById(userId);

    if (roleId !== undefined && roleId !== existingUser.role.id) {
      const targetRole = await this.prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true, active: true },
      });
      if (!targetRole) {
        throw new NotFoundException("Role not found");
      }
      if (!targetRole.active) {
        throw new BadRequestException("Cannot assign an inactive role");
      }
    }

    const email = person?.email?.trim().toLowerCase();
    if (email && email !== existingUser.person.email) {
      const emailInUse = await this.prisma.userAccount.findFirst({
        where: {
          personId: { not: userId },
          person: { is: { email } },
        },
        select: { personId: true },
      });
      if (emailInUse) {
        throw new ConflictException(
          "Email is already registered to a user account",
        );
      }
    }

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      let oldPerson;
      let updatedPerson;
      if (hasPersonChanges) {
        oldPerson = await transaction.person.findUnique({
          where: { id: userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
          },
        });
        if (!oldPerson) {
          throw new NotFoundException("User not found");
        }
        updatedPerson = await this.personsService.update(
          transaction,
          userId,
          person!,
        );
      }

      let changedUser;
      if (roleId !== undefined) {
        changedUser = await transaction.userAccount.update({
          where: { personId: userId },
          data: {
            ...(roleId !== undefined && {
              role: { connect: { id: roleId } },
            }),
          },
          select: userSelect,
        });
      } else {
        changedUser = await transaction.userAccount.findUnique({
          where: { personId: userId },
          select: userSelect,
        });
      }

      if (!changedUser) {
        throw new NotFoundException("User not found");
      }

      if (hasPersonChanges) {
        await this.recordUserAudit(transaction, currentUser, ipAddress, {
          action: "UPDATE",
          entityId: userId,
          oldData: { person: oldPerson },
          newData: {
            person: {
              id: updatedPerson.id,
              firstName: updatedPerson.firstName,
              lastName: updatedPerson.lastName,
              email: updatedPerson.email,
              phone: updatedPerson.phone,
              address: updatedPerson.address,
            },
          },
          reason: `Actualización de datos personales del usuario ${userId}`,
        });
      }

      if (roleId !== undefined && roleId !== existingUser.role.id) {
        await this.recordUserAudit(transaction, currentUser, ipAddress, {
          action: "ROLE_ASSIGNMENT",
          entityId: userId,
          oldData: { role: existingUser.role },
          newData: { role: changedUser.role },
          reason: `Cambio de rol del usuario ${userId}`,
        });
      }

      if (branchIds !== undefined) {
        const requestedBranches = await transaction.branch.findMany({
          where: { id: { in: branchIds }, active: true },
          select: { id: true, name: true },
        });
        if (requestedBranches.length !== branchIds.length) {
          throw new NotFoundException(
            "One or more active branches were not found",
          );
        }

        const currentBranches = existingUser.branches;
        const requestedIds = new Set(branchIds);
        const currentIds = new Set(currentBranches.map(({ id }) => id));
        const removedBranches = currentBranches.filter(
          ({ id }) => !requestedIds.has(id),
        );
        const addedBranches = requestedBranches.filter(
          ({ id }) => !currentIds.has(id),
        );

        if (removedBranches.length > 0) {
          await transaction.userBranch.updateMany({
            where: {
              userId,
              branchId: { in: removedBranches.map(({ id }) => id) },
              active: true,
            },
            data: { active: false, endDate: new Date() },
          });
        }

        for (const branch of removedBranches) {
          await this.recordUserAudit(transaction, currentUser, ipAddress, {
            action: "UNASSIGN",
            entityId: userId,
            oldData: { branchId: branch.id, branchName: branch.name },
            reason: `Desasignación de la sede ${branch.name} del usuario ${userId}`,
          });
        }

        for (const branch of addedBranches) {
          const previousAssignment = await transaction.userBranch.findFirst({
            where: { userId, branchId: branch.id, active: false },
            orderBy: { assignmentDate: "desc" },
          });
          if (previousAssignment) {
            await transaction.userBranch.update({
              where: { id: previousAssignment.id },
              data: { active: true, endDate: null },
            });
          } else {
            await transaction.userBranch.create({
              data: {
                userId,
                branchId: branch.id,
                assignmentDate: new Date(),
              },
            });
          }
          await this.recordUserAudit(transaction, currentUser, ipAddress, {
            action: "ASSIGN",
            entityId: userId,
            newData: { branchId: branch.id, branchName: branch.name },
            reason: `Asignación de la sede ${branch.name} al usuario ${userId}`,
          });
        }
      }

      if (branchIds !== undefined) {
        return transaction.userAccount.findUnique({
          where: { personId: userId },
          select: userSelect,
        });
      }
      return changedUser;
    });

    if (!updatedUser) {
      throw new NotFoundException("User not found");
    }

    this.logger.log(`User ${userId} updated`);
    return toUserResponse(updatedUser);
  }
}
