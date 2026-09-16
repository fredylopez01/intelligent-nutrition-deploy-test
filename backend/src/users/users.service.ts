import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../email/email.service.js";
import { createHash, randomBytes } from "node:crypto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}
  private readonly logger = new Logger(UsersService.name);

  async create(createUserDto: CreateUserDto) {
    const email = createUserDto.email.trim().toLowerCase();

    const existingUser = await this.prisma.userAccount.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const role = await this.prisma.role.findUnique({
      where: {
        id: createUserDto.roleId,
      },
    });

    if (!role) {
      throw new NotFoundException("Role not found");
    }

    const rawToken = randomBytes(32).toString("hex");

    const activationTokenHash = createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expirationMinutes = this.configService.get<number>(
      "ACTIVATION_TOKEN_EXPIRATION_MINUTES",
      4320,
    );

    const activationTokenExpiresAt = new Date(
      Date.now() + expirationMinutes * 60 * 1000,
    );

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

    const frontendUrl = this.configService.get<string>("FRONTEND_URL");

    if (!frontendUrl) {
      throw new Error("FRONTEND_URL environment variable is not configured");
    }

    const activationUrl = `${frontendUrl}/activate-account?token=${encodeURIComponent(rawToken)}`;

    try {
      await this.emailService.sendUserActivationEmail(
        user.email,
        user.fullName,
        activationUrl,
      );
    } catch (error) {
      this.logger.error(
        `User ${user.id} was created, but activation email could not be sent`,
        error,
      );

      throw new InternalServerErrorException(
        "User was created, but the activation email could not be sent",
      );
    }

    return user;
  }
}
