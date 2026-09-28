import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { PrismaService } from "../../../database/prisma/prisma.service.js";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const jwtSecret = configService.get<string>("JWT_SECRET");

    if (!jwtSecret) {
      throw new Error("JWT_SECRET environment variable is not configured");
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.userAccount.findUnique({
      where: { personId: payload.sub },
      select: {
        personId: true,
        roleId: true,
        active: true,
        mustChangePassword: true,
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            active: true,
          },
        },
        role: {
          select: { id: true, name: true, active: true },
        },
        branchAssignments: {
          where: { active: true },
          select: {
            branch: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user || !user.active || !user.person.active) {
      throw new UnauthorizedException("User is not authorized");
    }
    if (!user.role.active) {
      throw new ForbiddenException({
        code: "ROLE_INACTIVE",
        message: "The assigned role is inactive.",
      });
    }

    const fullName = [user.person.firstName, user.person.lastName]
      .filter(Boolean)
      .join(" ");

    return {
      id: user.personId,
      personId: user.personId,
      fullName,
      email: user.person.email,
      roleId: user.roleId,
      active: user.active,
      mustChangePassword: user.mustChangePassword,
      person: user.person,
      role: { id: user.role.id, name: user.role.name },
      branches: user.branchAssignments.map(({ branch }) => branch),
    };
  }
}
