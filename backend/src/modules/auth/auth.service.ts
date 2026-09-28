import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { ActivateAccountDto } from "./dto/activate.dto.js";
import { ResendActivationDto } from "./dto/resend-activation.dto.js";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../../modules/email/email.service.js";
import { CryptoUtil } from "../../common/utils/crypto.util.js";

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
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "The provided credentials are invalid.",
      });
    }

    if (!user.active || !user.person.active) {
      throw new ForbiddenException({
        code: "ACCOUNT_INACTIVE",
        message: "The user account is inactive.",
      });
    }

    if (!user.role.active) {
      throw new ForbiddenException({
        code: "ROLE_INACTIVE",
        message: "The assigned role is inactive.",
      });
    }

    if (!user.password || user.mustChangePassword) {
      throw new ForbiddenException({
        code: "ACCOUNT_NOT_ACTIVATED",
        message: "The user account has not been activated.",
      });
    }

    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(user.password, loginDto.password);
    } catch {
      passwordMatches = false;
    }

    if (!passwordMatches) {
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "The provided credentials are invalid.",
      });
    }

    await this.prisma.userAccount.update({
      where: { personId: user.personId },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwtService.signAsync({ sub: user.personId });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: this.configService.get<string>("JWT_EXPIRES_IN", "15m"),
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
      throw new BadRequestException("Invalid or expired activation token");
    }

    if (!user.mustChangePassword || user.password) {
      throw new ConflictException({
        code: "ACCOUNT_ALREADY_ACTIVATED",
        message: "The user account is already activated.",
      });
    }

    if (!user.active) {
      throw new ForbiddenException({
        code: "ACCOUNT_INACTIVE",
        message: "The user account is inactive.",
      });
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

    return { message: "User account activated successfully" };
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
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User account not found.",
      });
    }

    if (!user.mustChangePassword || user.password) {
      throw new ConflictException({
        code: "ACCOUNT_ALREADY_ACTIVATED",
        message: "The user account is already activated.",
      });
    }
    if (!user.active) {
      throw new ForbiddenException({
        code: "ACCOUNT_INACTIVE",
        message: "The user account is inactive.",
      });
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

    return { message: "Activation email sent successfully" };
  }
}
