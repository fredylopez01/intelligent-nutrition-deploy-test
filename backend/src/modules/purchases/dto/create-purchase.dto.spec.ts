import { describe, expect, it } from "@jest/globals";
import { ValidationPipe } from "@nestjs/common";
import { CreatePurchaseDto } from "./create-purchase.dto.js";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const body = (requestedQuantity: unknown) => ({
  supplierId: "11111111-1111-4111-8111-111111111111",
  items: [
    {
      productId: "22222222-2222-4222-8222-222222222222",
      requestedQuantity,
      unitPrice: "98000.00",
    },
  ],
});

const validate = (value: Record<string, unknown>) =>
  pipe.transform(value, { type: "body", metatype: CreatePurchaseDto });

describe("CreatePurchaseDto", () => {
  it("accepts a whole requested quantity", async () => {
    await expect(validate(body(50))).resolves.toBeInstanceOf(CreatePurchaseDto);
  });

  it.each([1.5, 0, -3])(
    "rejects the requested quantity %s",
    async (quantity) => {
      await expect(validate(body(quantity))).rejects.toThrow();
    },
  );
});
