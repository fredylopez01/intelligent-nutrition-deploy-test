import "reflect-metadata";
import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import { PaymentMethodsController } from "./payment-methods.controller.js";
import { ROLES_KEY } from "../../common/decorators/roles.decorator.js";
import type { PaymentMethodsService } from "./payment-methods.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const serviceMock = { create: jest.fn<AsyncMock>() };

const createdAt = new Date("2026-10-21T13:30:00.000Z");

const validPayload = { code: "NEQUI", name: "Nequi" };

describe("PaymentMethodsController", () => {
  let controller: PaymentMethodsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentMethodsController(
      serviceMock as unknown as PaymentMethodsService,
    );
  });

  it("delegates the creation to the service", async () => {
    const paymentMethod = {
      id: "55555555-5555-4555-8555-555555555555",
      code: "NEQUI",
      name: "Nequi",
      active: true,
      createdAt,
      updatedAt: createdAt,
    };
    serviceMock.create.mockResolvedValue(paymentMethod);

    const result = await controller.create(validPayload);

    expect(serviceMock.create).toHaveBeenCalledTimes(1);
    expect(serviceMock.create).toHaveBeenCalledWith(validPayload);
    expect(result).toBe(paymentMethod);
  });

  it("propagates the error when the service rejects", async () => {
    const error = new Error("conflict");
    serviceMock.create.mockRejectedValue(error);

    await expect(controller.create(validPayload)).rejects.toBe(error);
  });

  it("is restricted to the SUPERADMIN role", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      PaymentMethodsController.prototype,
      "create",
    );
    const roles = descriptor
      ? (Reflect.getMetadata(ROLES_KEY, descriptor.value as object) as unknown)
      : undefined;

    expect(roles).toEqual(["SUPERADMIN"]);
  });
});
