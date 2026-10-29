import "reflect-metadata";
import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import { InventoryClosuresGlobalController } from "./inventory-closures-global.controller.js";
import { ROLES_KEY } from "../../common/decorators/roles.decorator.js";
import type { InventoryClosuresService } from "./inventory-closures.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "11111111-1111-4111-8111-111111111111";
const closureId = "33333333-3333-4333-8333-333333333333";

const currentUser: AuthenticatedUser = {
  id: "22222222-2222-4222-8222-222222222222",
  active: true,
  role: { name: "BRANCH_LEADER" },
};

const serviceMock = {
  confirm: jest.fn<AsyncMock>(),
  findOne: jest.fn<AsyncMock>(),
  findAll: jest.fn<AsyncMock>(),
  updateCounts: jest.fn<AsyncMock>(),
};

function rolesOf(method: keyof InventoryClosuresGlobalController): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(
    InventoryClosuresGlobalController.prototype,
    method,
  );
  return descriptor
    ? (Reflect.getMetadata(ROLES_KEY, descriptor.value as object) as unknown)
    : undefined;
}

describe("InventoryClosuresGlobalController.confirm", () => {
  let controller: InventoryClosuresGlobalController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InventoryClosuresGlobalController(
      serviceMock as unknown as InventoryClosuresService,
    );
  });

  it("delegates the confirmation to the service", async () => {
    const closure = { id: closureId, branchId, status: "CONFIRMED" };
    serviceMock.confirm.mockResolvedValue(closure);

    const result = await controller.confirm(
      closureId,
      currentUser,
      "127.0.0.1",
    );

    expect(serviceMock.confirm).toHaveBeenCalledTimes(1);
    expect(serviceMock.confirm).toHaveBeenCalledWith(
      closureId,
      currentUser,
      "127.0.0.1",
    );
    expect(result).toBe(closure);
  });

  it("propagates the error when the service rejects", async () => {
    const error = new Error("closure not found");
    serviceMock.confirm.mockRejectedValue(error);

    await expect(
      controller.confirm(closureId, currentUser, "127.0.0.1"),
    ).rejects.toBe(error);
  });

  it("lets the superadmin and the branch roles confirm", () => {
    expect(rolesOf("confirm")).toEqual([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
  });

  it("lets the superadmin and the branch roles register counts", () => {
    expect(rolesOf("updateCounts")).toEqual([
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
    ]);
  });

  it.each(["findOne", "findAll"] as const)(
    "lets the superadmin and the branch roles read with %s",
    (method) => {
      expect(rolesOf(method)).toEqual([
        "SUPERADMIN",
        "BRANCH_LEADER",
        "BRANCH_ASSISTANT",
      ]);
    },
  );

  it("passes the user to the detail and the list to apply the blind count", async () => {
    serviceMock.findOne.mockResolvedValue({ id: closureId });
    serviceMock.findAll.mockResolvedValue({ data: [] });

    await controller.findOne(closureId, currentUser);
    await controller.findAll({ page: 1, limit: 20, branchId }, currentUser);

    expect(serviceMock.findOne).toHaveBeenCalledWith(closureId, currentUser);
    expect(serviceMock.findAll).toHaveBeenCalledWith(
      { page: 1, limit: 20, branchId },
      currentUser,
    );
  });
});
