import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ROLES_KEY } from "../decorators/roles.decorator.js";
import { AuthenticatedUser } from "../interfaces/AuthenticatedUser.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;

    if (!user || !user.active) {
      throw new ForbiddenException({
        code: "INSUFFICIENT_PERMISSIONS",
        message: "You do not have permission to perform this operation.",
        details: {},
      });
    }

    const hasRequiredRole = requiredRoles.includes(user.role.name);

    if (!hasRequiredRole) {
      throw new ForbiddenException({
        code: "INSUFFICIENT_PERMISSIONS",
        message: "You do not have permission to perform this operation.",
        details: {},
      });
    }

    return true;
  }
}
