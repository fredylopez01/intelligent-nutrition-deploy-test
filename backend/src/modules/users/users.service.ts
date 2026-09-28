import {
  BadRequestException,
  ConflictException,
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
  ) {}

  async create(createUserDto: CreateUserDto) {
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
        select: { id: true },
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

      return transaction.userAccount.create({
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

    const updatedUser = await this.prisma.userAccount.update({
      where: { personId: userId },
      data: { roleId },
      select: userSelect,
    });

    return toUserResponse(updatedUser);
  }

  async update(
    userId: string,
    updateUserDto: UpdateUserDto,
    currentUser: AuthenticatedUser,
  ) {
    const isPrivileged = ["SUPERADMIN", "DEV"].includes(currentUser.role.name);
    const updatesAccount =
      updateUserDto.roleId !== undefined || updateUserDto.active !== undefined;
    if (currentUser.id !== userId && !isPrivileged) {
      throw new BadRequestException("You can only update your own account");
    }
    if (updatesAccount && !isPrivileged) {
      throw new BadRequestException(
        "Only SUPERADMIN or DEV can update account access",
      );
    }
    if (currentUser.id === userId && updateUserDto.active === false) {
      throw new BadRequestException("You cannot deactivate your own account");
    }

    const { person, roleId, active } = updateUserDto;
    const hasPersonChanges =
      person !== undefined &&
      Object.values(person).some((value) => value !== undefined);
    if (!hasPersonChanges && roleId === undefined && active === undefined) {
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
      if (hasPersonChanges) {
        await this.personsService.update(transaction, userId, person!);
      }

      if (roleId !== undefined || active !== undefined) {
        return transaction.userAccount.update({
          where: { personId: userId },
          data: {
            ...(roleId !== undefined && {
              role: { connect: { id: roleId } },
            }),
            ...(active !== undefined && { active }),
          },
          select: userSelect,
        });
      }

      return transaction.userAccount.findUnique({
        where: { personId: userId },
        select: userSelect,
      });
    });

    if (!updatedUser) {
      throw new NotFoundException("User not found");
    }

    this.logger.log(`User ${userId} updated`);
    return toUserResponse(updatedUser);
  }
}
