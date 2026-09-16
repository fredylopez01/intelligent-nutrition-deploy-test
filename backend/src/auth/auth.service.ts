import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { ActivateAccountDto } from "./dto/activate.dto.js";
import { createHash, randomBytes } from "node:crypto";
import { ResendActivationDto } from "./dto/resend-activation.dto.js";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../email/email.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.prisma.userAccount.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.active) {
      throw new UnauthorizedException("User account is inactive");
    }

    if (!user.passwordHash || user.mustChangePassword) {
      throw new UnauthorizedException("Account activation is required");
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.prisma.userAccount.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    const payload = {
      sub: user.id,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      expiresIn: process.env.JWT_EXPIRES_IN ?? "15m",
    };
  }

  async activateAccount(activateAccountDto: ActivateAccountDto) {
    const tokenHash = createHash("sha256")
      .update(activateAccountDto.token)
      .digest("hex");

    const user = await this.prisma.userAccount.findUnique({
      where: {
        activationTokenHash: tokenHash,
      },
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired activation token");
    }

    if (
      !user.activationTokenExpiresAt ||
      user.activationTokenExpiresAt <= new Date()
    ) {
      throw new BadRequestException("Invalid or expired activation token");
    }

    if (!user.mustChangePassword || user.passwordHash) {
      throw new BadRequestException("User account is already activated");
    }

    const passwordHash = await argon2.hash(activateAccountDto.password);

    await this.prisma.userAccount.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash,
        mustChangePassword: false,
        activationTokenHash: null,
        activationTokenExpiresAt: null,
      },
    });

    return {
      message: "User account activated successfully",
    };
  }

  async resendActivation(resendActivationDto: ResendActivationDto) {
    const email = resendActivationDto.email.trim().toLowerCase();

    const user = await this.prisma.userAccount.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException("User account not found");
    }

    if (!user.mustChangePassword || user.passwordHash) {
      throw new BadRequestException("User account is already activated");
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

    await this.prisma.userAccount.update({
      where: {
        id: user.id,
      },
      data: {
        activationTokenHash,
        activationTokenExpiresAt,
      },
    });

    const frontendUrl = this.configService.get<string>("FRONTEND_URL");

    if (!frontendUrl) {
      throw new Error("FRONTEND_URL environment variable is not configured");
    }

    const activationUrl = `${frontendUrl}/activate-account?token=${encodeURIComponent(rawToken)}`;

    await this.emailService.sendUserActivationEmail(
      user.email,
      user.fullName,
      activationUrl,
    );

    return {
      message: "Activation email sent successfully",
    };
  }
}
