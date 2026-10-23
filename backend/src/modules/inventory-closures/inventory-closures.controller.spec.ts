import "reflect-metadata";
import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import { InventoryClosuresController } from "./inventory-closures.controller.js";
import { ROLES_KEY } from "../../common/decorators/roles.decorator.js";
import type { InventoryClosuresService } from "./inventory-closures.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "11111111-1111-4111-8111-111111111111";
const closureId = "33333333-3333-4333-8333-333333333333";

const currentUser: AuthenticatedUser = {
  id: "22222222-2222-4222-8222-222222222222",
  active: true,
  role: { name: "SUPERADMIN" },
};

const serviceMock = { create: jest.fn<AsyncMock>() };

describe("InventoryClosuresController", () => {
  let controller: InventoryClosuresController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InventoryClosuresController(
      serviceMock as unknown as InventoryClosuresService,
    );
  });

  it("delegates the creation to the service", async () => {
    const closure = { id: closureId, branchId, status: "PENDING" };
    serviceMock.create.mockResolvedValue(closure);

    const result = await controller.create(branchId, currentUser, "127.0.0.1");

    expect(serviceMock.create).toHaveBeenCalledTimes(1);
    expect(serviceMock.create).toHaveBeenCalledWith(
      branchId,
      currentUser,
      "127.0.0.1",
    );
    expect(result).toBe(closure);
  });

  it("propagates the error when the service rejects", async () => {
    const error = new Error("branch not found");
    serviceMock.create.mockRejectedValue(error);

    await expect(
      controller.create(branchId, currentUser, "127.0.0.1"),
    ).rejects.toBe(error);
  });

  it("is restricted to the allowed roles", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      InventoryClosuresController.prototype,
      "create",
    );
    const roles = descriptor
      ? (Reflect.getMetadata(ROLES_KEY, descriptor.value as object) as unknown)
      : undefined;

    expect(roles).toEqual([
      "DEV",
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
  });
});
