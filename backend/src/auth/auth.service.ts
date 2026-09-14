import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service.js";
import { LoginDto } from "./dto/login.dto.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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
}
