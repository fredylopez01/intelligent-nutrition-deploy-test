import { Injectable } from "@nestjs/common";
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
