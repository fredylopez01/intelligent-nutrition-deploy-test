import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { BRANCH_SCOPE_KEY } from "../decorators/branch-scope.decorator.js";
import type { AuthenticatedUser } from "../interfaces/AuthenticatedUser.js";

const DEFAULT_FIELDS = ["params.branchId", "body.branchId", "query.branchId"];

const SCOPED_ROLES = new Set(["BRANCH_LEADER", "BRANCH_ASSISTANT"]);

interface BranchScopedRequest {
  user?: AuthenticatedUser;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

function readField(request: BranchScopedRequest, field: string): unknown {
  const [source, property] = field.split(".");
  if (!source || !property) return undefined;

  const container = request[source as keyof BranchScopedRequest];
  if (!container || typeof container !== "object") return undefined;

  return (container as Record<string, unknown>)[property];
}

function branchValues(value: unknown): string[] {
  if (typeof value === "string") return value.length > 0 ? [value] : [];
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }
  return [];
}

function insufficientPermissions(): ForbiddenException {
  return new ForbiddenException({
    code: "INSUFFICIENT_PERMISSIONS",
    message: "You do not have permission to perform this operation.",
    details: {},
  });
}

function scopeViolation(branchId: string): ForbiddenException {
  return new ForbiddenException({
    code: "BRANCH_SCOPE_VIOLATION",
    message: "You do not have access to this branch.",
    details: { branchId },
  });
}

@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const fields =
      this.reflector.getAllAndOverride<string[]>(BRANCH_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_FIELDS;

    const request = context.switchToHttp().getRequest<BranchScopedRequest>();
    const user = request.user;

    if (!user || !user.active) {
      throw insufficientPermissions();
    }

    // SUPERADMIN and any other role are handled by RolesGuard. Only branch
    // roles are limited to their active branch assignments.
    if (!SCOPED_ROLES.has(user.role?.name)) {
      return true;
    }

    const assignedBranches = new Set(
      (user.branches ?? []).map((branch) => branch.id),
    );

    for (const field of fields) {
      for (const branchId of branchValues(readField(request, field))) {
        if (!assignedBranches.has(branchId)) {
          throw scopeViolation(branchId);
        }
      }
    }

    return true;
  }
}
