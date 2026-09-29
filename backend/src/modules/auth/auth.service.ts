import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { ActivateAccountDto } from "./dto/activate.dto.js";
import { ResendActivationDto } from "./dto/resend-activation.dto.js";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../../modules/email/email.service.js";
import { CryptoUtil } from "../../common/utils/crypto.util.js";
import { AuthExceptions } from "./auth.exceptions.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { AuditService } from "../audit/audit.service.js";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
  ) {}

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.prisma.userAccount.findFirst({
      where: { person: { is: { email } } },
      select: {
        personId: true,
        password: true,
        active: true,
        mustChangePassword: true,
        role: { select: { id: true, name: true, active: true } },
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            active: true,
          },
        },
      },
    });

    if (!user) {
      throw AuthExceptions.invalidCredentials();
    }

    if (!user.active || !user.person.active) {
      throw AuthExceptions.accountInactive();
    }

    if (!user.role.active) {
      throw AuthExceptions.roleInactive();
    }

    if (!user.password || user.mustChangePassword) {
      throw AuthExceptions.accountNotActivated();
    }

    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(user.password, loginDto.password);
    } catch {
      passwordMatches = false;
    }

    if (!passwordMatches) {
      throw AuthExceptions.invalidCredentials();
    }

    await this.prisma.userAccount.update({
      where: { personId: user.personId },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwtService.signAsync({ sub: user.personId });

    return {
      accessToken,
      tokenType: "Bearer",
      user: {
        id: user.personId,
        personId: user.personId,
        role: { id: user.role.id, name: user.role.name },
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async activateAccount(activateAccountDto: ActivateAccountDto) {
    const tokenHash = CryptoUtil.hashToken(activateAccountDto.token);

    const user = await this.prisma.userAccount.findUnique({
      where: { activationToken: tokenHash },
      select: {
        personId: true,
        password: true,
        active: true,
        mustChangePassword: true,
        activationTokenExpiresAt: true,
      },
    });

    if (
      !user ||
      !user.activationTokenExpiresAt ||
      user.activationTokenExpiresAt <= new Date()
    ) {
      throw AuthExceptions.invalidActivationToken();
    }

    if (!user.mustChangePassword || user.password) {
      throw AuthExceptions.accountAlreadyActivated();
    }

    if (!user.active) {
      throw AuthExceptions.accountInactive();
    }

    const password = await argon2.hash(activateAccountDto.password);

    await this.prisma.userAccount.update({
      where: { personId: user.personId },
      data: {
        password,
        mustChangePassword: false,
        activationToken: null,
        activationTokenExpiresAt: null,
      },
    });

    return { message: "Account activated successfully." };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const genericResponse = {
      message:
        "If an account with that email exists, a password reset link will be sent.",
    };
    const email = forgotPasswordDto.email.trim().toLowerCase();
    const user = await this.prisma.userAccount.findFirst({
      where: {
        active: true,
        mustChangePassword: false,
        person: { is: { email, active: true } },
      },
      select: {
        personId: true,
        person: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!user) {
      return genericResponse;
    }

    const rawToken = CryptoUtil.generateRandomToken();
    const passwordResetToken = CryptoUtil.hashToken(rawToken);
    const configuredExpiration = Number(
      this.configService.get<number>(
        "PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES",
        60,
      ),
    );
    const expirationMinutes =
      Number.isInteger(configuredExpiration) && configuredExpiration > 0
        ? configuredExpiration
        : 60;
    const passwordResetTokenExpiresAt =
      CryptoUtil.getExpirationDate(expirationMinutes);

    await this.prisma.userAccount.update({
      where: { personId: user.personId },
      data: { passwordResetToken, passwordResetTokenExpiresAt },
    });

    try {
      const resetUrl = CryptoUtil.buildPasswordResetUrl(
        this.configService,
        rawToken,
      );
      await this.emailService.sendPasswordResetEmail(
        user.person.email!,
        [user.person.firstName, user.person.lastName].filter(Boolean).join(" "),
        resetUrl,
        expirationMinutes,
      );
    } catch (error) {
      this.logger.error(
        `Password reset email could not be sent for account ${user.personId}`,
        error,
      );
    }

    return genericResponse;
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const tokenHash = CryptoUtil.hashToken(resetPasswordDto.token);
    const now = new Date();
    const user = await this.prisma.userAccount.findUnique({
      where: { passwordResetToken: tokenHash },
      select: {
        personId: true,
        active: true,
        mustChangePassword: true,
        passwordResetTokenExpiresAt: true,
      },
    });

    if (
      !user ||
      !user.active ||
      user.mustChangePassword ||
      !user.passwordResetTokenExpiresAt ||
      user.passwordResetTokenExpiresAt <= now
    ) {
      throw AuthExceptions.invalidPasswordResetToken();
    }

    const password = await argon2.hash(resetPasswordDto.password);
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.userAccount.updateMany({
        where: {
          personId: user.personId,
          passwordResetToken: tokenHash,
          passwordResetTokenExpiresAt: { gt: now },
          active: true,
          mustChangePassword: false,
        },
        data: {
          password,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
        },
      });

      if (result.count !== 1) {
        throw AuthExceptions.invalidPasswordResetToken();
      }

      await this.auditService.createAuditLog(
        {
          userId: user.personId,
          action: "PASSWORD_RESET",
          entity: "USER",
          entityId: user.personId,
          newData: { passwordChanged: true },
          reason:
            "Restablecimiento de contraseña mediante enlace de recuperación",
        },
        transaction,
      );
    });

    return { message: "Password reset successfully." };
  }

  async resendActivation(resendActivationDto: ResendActivationDto) {
    const email = resendActivationDto.email.trim().toLowerCase();

    const user = await this.prisma.userAccount.findFirst({
      where: { person: { is: { email } } },
      select: {
        personId: true,
        active: true,
        mustChangePassword: true,
        password: true,
        person: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!user) {
      throw AuthExceptions.userNotFound();
    }

    if (!user.mustChangePassword || user.password) {
      throw AuthExceptions.accountAlreadyActivated();
    }
    if (!user.active) {
      throw AuthExceptions.accountInactive();
    }

    const rawToken = CryptoUtil.generateRandomToken();
    const activationToken = CryptoUtil.hashToken(rawToken);
    const expirationMinutes = this.configService.get<number>(
      "ACTIVATION_TOKEN_EXPIRATION_MINUTES",
      4320,
    );
    const activationTokenExpiresAt =
      CryptoUtil.getExpirationDate(expirationMinutes);

    await this.prisma.userAccount.update({
      where: { personId: user.personId },
      data: {
        activationToken,
        activationTokenExpiresAt,
      },
    });

    const activationUrl = CryptoUtil.buildActivationUrl(
      this.configService,
      rawToken,
    );
    await this.emailService.sendUserActivationEmail(
      user.person.email!,
      [user.person.firstName, user.person.lastName].filter(Boolean).join(" "),
      activationUrl,
    );

    return { message: "Activation email sent successfully." };
  }
}
