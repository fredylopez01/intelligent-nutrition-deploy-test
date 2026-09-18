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
import { AuthService } from "../auth/auth.service.js";
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";
import { PaginatedUsersResponseDto } from "./dto/paginated-user-response.dto.js";
import { ChangeUserRoleDto } from "./dto/change-user-role.dto.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const email = createUserDto.email.trim().toLowerCase();

    const existingUser = await this.prisma.userAccount.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const role = await this.prisma.role.findUnique({
      where: { id: createUserDto.roleId },
    });

    if (!role) {
      throw new NotFoundException("Role not found");
    }

    const rawToken = CryptoUtil.generateRandomToken();
    const activationTokenHash = CryptoUtil.hashToken(rawToken);
    const expirationMinutes = this.configService.get<number>(
      "ACTIVATION_TOKEN_EXPIRATION_MINUTES",
      4320,
    );
    const activationTokenExpiresAt =
      CryptoUtil.getExpirationDate(expirationMinutes);

    const user = await this.prisma.userAccount.create({
      data: {
        fullName: createUserDto.fullName.trim(),
        email,
        roleId: createUserDto.roleId,
        passwordHash: null,
        mustChangePassword: true,
        activationTokenHash,
        activationTokenExpiresAt,
        active: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        roleId: true,
        active: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    const activationUrl = CryptoUtil.buildActivationUrl(
      this.configService,
      rawToken,
    );

    try {
      await this.emailService.sendUserActivationEmail(
        user.email,
        user.fullName,
        activationUrl,
      );
    } catch (error) {
      this.logger.error(
        `User ${user.id} created, but activation email failed`,
        error,
      );
      throw new InternalServerErrorException(
        "User was created, but the activation email could not be sent",
      );
    }

    return user;
  }

  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const { page, limit, active } = query;
    const skip = (page - 1) * limit;

    const where = active === undefined ? {} : { active };

    const [total, users] = await this.prisma.$transaction([
      this.prisma.userAccount.count({ where }),
      this.prisma.userAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          active: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      ...(total === 0 && {
        message: "No registered users were found.",
      }),
    };
  }

  async findUserById(userId: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        active: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
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
      where: { id: userId },
      data: { roleId },
      select: {
        id: true,
        fullName: true,
        email: true,
        active: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: { id: true, name: true },
        },
      },
    });

    return updatedUser;
  }
}
