import { expect, it, describe } from "@jest/globals";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { PRESERVE_API_ENVELOPE } from "../decorators/preserve-api-envelope.decorator.js";
import { ApiResponseInterceptor } from "./api-response.interceptor.js";

describe("ApiResponseInterceptor", () => {
  const interceptor = new ApiResponseInterceptor();

  async function intercept(value: unknown, handlerFunction = () => {}) {
    const context = {
      getHandler: () => handlerFunction,
    } as unknown as ExecutionContext;
    const callHandler = { handle: () => of(value) } as CallHandler;
    return firstValueFrom(interceptor.intercept(context, callHandler));
  }

  it("keeps collection data and pagination metadata at the same level", async () => {
    const response = { data: [{ id: "user-1" }], meta: { page: 1 } };

    await expect(intercept(response)).resolves.toEqual(response);
  });

  it("wraps individual and non-paginated collection responses", async () => {
    await expect(intercept({ id: "user-1" })).resolves.toEqual({
      data: { id: "user-1" },
    });
    await expect(intercept([{ id: "role-1" }])).resolves.toEqual({
      data: [{ id: "role-1" }],
    });
  });

  it("preserves the nested envelope required by the audit contract", async () => {
    const handler = () => {};
    Reflect.defineMetadata(PRESERVE_API_ENVELOPE, true, handler);
    const response = { data: [{ id: "audit-1" }], meta: { page: 1 } };

    await expect(intercept(response, handler)).resolves.toEqual({
      data: response,
    });
  });
});
