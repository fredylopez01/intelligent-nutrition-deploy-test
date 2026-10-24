import { describe, expect, it } from "@jest/globals";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { PurchasesController } from "./purchases.controller.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { ROLES_KEY } from "../../common/decorators/roles.decorator.js";

describe("POST /purchases role guard", () => {
  const guard = new RolesGuard(new Reflector());
  const purchaseMethod: unknown = Object.getOwnPropertyDescriptor(
    PurchasesController.prototype,
    "create",
  )?.value;
  if (typeof purchaseMethod !== "function") {
    throw new Error("PurchasesController.create handler is missing");
  }
  const roles: unknown = Reflect.getMetadata(ROLES_KEY, purchaseMethod);
  if (
    !Array.isArray(roles) ||
    roles.some((role: unknown) => typeof role !== "string")
  ) {
    throw new Error("PurchasesController.create roles are missing");
  }
  const purchaseRoles = roles as string[];
  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_KEY, purchaseRoles, handler);
  const controller = PurchasesController;

  const contextFor = (user?: AuthenticatedUser) =>
    ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  it.each(["DEV", "SUPERADMIN", "BRANCH_LEADER"])(
    "allows the %s role to create purchases",
    (roleName) => {
      const user: AuthenticatedUser = {
        id: "authorized-user",
        active: true,
        role: { name: roleName },
      };

      expect(guard.canActivate(contextFor(user))).toBe(true);
    },
  );

  it("denies users without one of the allowed purchase roles", () => {
    const user: AuthenticatedUser = {
      id: "assistant-user",
      active: true,
      role: { name: "BRANCH_ASSISTANT" },
    };

    expect(() => guard.canActivate(contextFor(user))).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: "INSUFFICIENT_PERMISSIONS",
        }),
      }),
    );
  });

  it("denies an inactive user even when its role is allowed", () => {
    const user: AuthenticatedUser = {
      id: "inactive-user",
      active: false,
      role: { name: "SUPERADMIN" },
    };

    expect(() => guard.canActivate(contextFor(user))).toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: "INSUFFICIENT_PERMISSIONS",
        }),
      }),
    );
  });

  it("has the expected roles configured on the purchase endpoint", () => {
    expect(purchaseRoles).toEqual(["DEV", "SUPERADMIN", "BRANCH_LEADER"]);
  });
});
