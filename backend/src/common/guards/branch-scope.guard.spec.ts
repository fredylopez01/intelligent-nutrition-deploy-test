import { beforeEach, describe, expect, it } from "@jest/globals";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host.js";
import type { AuthenticatedUser } from "../interfaces/AuthenticatedUser.js";
import { BranchScopeGuard } from "./branch-scope.guard.js";

const ASSIGNED_BRANCH_ID = "branch-assigned";
const OTHER_BRANCH_ID = "branch-other";

const userWithRole = (
  name: string,
  branches: Array<{ id: string; name: string }> = [],
): AuthenticatedUser => ({
  id: "user-id",
  active: true,
  role: { name },
  branches,
});

describe("BranchScopeGuard", () => {
  let guard: BranchScopeGuard;

  beforeEach(() => {
    guard = new BranchScopeGuard(new Reflector());
  });

  const contextFor = (user: AuthenticatedUser, branchId: string) =>
    new ExecutionContextHost(
      [
        {
          user,
          params: { branchId },
          body: {},
          query: {},
        },
      ],
      BranchScopeGuard,
      () => undefined,
    );

  it("allows a BRANCH_LEADER to access their assigned branch", () => {
    const context = contextFor(
      userWithRole("BRANCH_LEADER", [
        { id: ASSIGNED_BRANCH_ID, name: "Centro" },
      ]),
      ASSIGNED_BRANCH_ID,
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it("denies a BRANCH_LEADER access to another branch with the correct 403 error", () => {
    const context = contextFor(
      userWithRole("BRANCH_LEADER", [
        { id: ASSIGNED_BRANCH_ID, name: "Centro" },
      ]),
      OTHER_BRANCH_ID,
    );

    let thrown: unknown;
    try {
      guard.canActivate(context);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    if (!(thrown instanceof ForbiddenException)) {
      throw new Error("Expected BranchScopeGuard to throw ForbiddenException");
    }
    expect(thrown.getStatus()).toBe(403);
    expect(thrown.getResponse()).toEqual({
      code: "BRANCH_SCOPE_VIOLATION",
      message: "You do not have access to this branch.",
      details: { branchId: OTHER_BRANCH_ID },
    });
  });

  it("allows SUPERADMIN to access any branch without restriction", () => {
    const context = contextFor(userWithRole("SUPERADMIN"), OTHER_BRANCH_ID);

    expect(guard.canActivate(context)).toBe(true);
  });
});
