import { describe, expect, it } from "@jest/globals";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { PurchasesController } from "./purchases.controller.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { ROLES_KEY } from "../../common/decorators/roles.decorator.js";

function handlerWithRoles(methodName: "create" | "findAll" | "findOne") {
  const method: unknown = Object.getOwnPropertyDescriptor(
    PurchasesController.prototype,
    methodName,
  )?.value;
  if (typeof method !== "function") {
    throw new Error(`PurchasesController.${methodName} handler is missing`);
  }
  const metadata: unknown = Reflect.getMetadata(ROLES_KEY, method);
  if (
    !Array.isArray(metadata) ||
    metadata.some((role: unknown) => typeof role !== "string")
  ) {
    throw new Error(`PurchasesController.${methodName} roles are missing`);
  }
  const roles = metadata as string[];
  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_KEY, roles, handler);
  return { handler, roles };
}

describe("POST /purchases role guard", () => {
  const guard = new RolesGuard(new Reflector());
  const endpoint = handlerWithRoles("create");
  const controller = PurchasesController;

  const contextFor = (user?: AuthenticatedUser, handler = endpoint.handler) =>
    ({
      getArgs: () => [{ user }],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({
        getData: () => undefined,
        getContext: () => undefined,
      }),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => undefined,
        getNext: () => undefined,
      }),
      switchToWs: () => ({
        getClient: () => undefined,
        getData: () => undefined,
        getPattern: () => "",
      }),
      getType: () => "http",
      getClass: () => controller,
      getHandler: () => handler,
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
    expect(endpoint.roles).toEqual(["DEV", "SUPERADMIN", "BRANCH_LEADER"]);
  });
});

describe("GET /purchases role guards", () => {
  const guard = new RolesGuard(new Reflector());
  const listEndpoint = handlerWithRoles("findAll");
  const detailEndpoint = handlerWithRoles("findOne");

  const contextFor = (handler: () => undefined, user: AuthenticatedUser) =>
    ({
      getArgs: () => [{ user }],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({
        getData: () => undefined,
        getContext: () => undefined,
      }),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => undefined,
        getNext: () => undefined,
      }),
      switchToWs: () => ({
        getClient: () => undefined,
        getData: () => undefined,
        getPattern: () => "",
      }),
      getType: () => "http",
      getClass: () => PurchasesController,
      getHandler: () => handler,
    }) as ExecutionContext;

  it.each([
    ["list", listEndpoint],
    ["detail", detailEndpoint],
  ])(
    "allows authorized roles to access the purchase %s endpoint",
    (_name, endpoint) => {
      const user: AuthenticatedUser = {
        id: "authorized-user",
        active: true,
        role: { name: "BRANCH_LEADER" },
      };

      expect(guard.canActivate(contextFor(endpoint.handler, user))).toBe(true);
      expect(endpoint.roles).toEqual(["DEV", "SUPERADMIN", "BRANCH_LEADER"]);
    },
  );

  it.each([
    ["list", listEndpoint],
    ["detail", detailEndpoint],
  ])(
    "denies unauthorized roles from the purchase %s endpoint",
    (_name, endpoint) => {
      const user: AuthenticatedUser = {
        id: "assistant-user",
        active: true,
        role: { name: "BRANCH_ASSISTANT" },
      };

      expect(() =>
        guard.canActivate(contextFor(endpoint.handler, user)),
      ).toThrow(
        expect.objectContaining({
          status: 403,
          response: expect.objectContaining({
            code: "INSUFFICIENT_PERMISSIONS",
          }),
        }),
      );
    },
  );
});
