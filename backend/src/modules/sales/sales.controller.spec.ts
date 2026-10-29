import "reflect-metadata";
import { describe, expect, it } from "@jest/globals";
import { ROLES_KEY } from "../../common/decorators/roles.decorator.js";
import { SalesController } from "./sales.controller.js";

function rolesOf(method: keyof SalesController): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(
    SalesController.prototype,
    method,
  );
  return descriptor
    ? (Reflect.getMetadata(ROLES_KEY, descriptor.value as object) as unknown)
    : undefined;
}

describe("SalesController roles", () => {
  it("lets the superadmin and the branch roles register sales", () => {
    expect(rolesOf("create")).toEqual([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
  });

  it("lets the superadmin and the branch roles reverse a sale", () => {
    expect(rolesOf("reverse")).toEqual([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
  });

  it.each(["findAll", "findOne"] as const)(
    "lets the three roles read with %s",
    (method) => {
      expect(rolesOf(method)).toEqual([
        "SUPERADMIN",
        "BRANCH_LEADER",
        "BRANCH_ASSISTANT",
      ]);
    },
  );
});
