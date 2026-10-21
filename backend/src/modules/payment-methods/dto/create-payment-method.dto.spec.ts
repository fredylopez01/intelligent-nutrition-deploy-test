import { describe, it, expect } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { CreatePaymentMethodDto } from "./create-payment-method.dto.js";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const validPayload = {
  code: "NEQUI",
  name: "Nequi",
};

async function parse(payload: Record<string, unknown>) {
  return (await pipe.transform(payload, {
    type: "body",
    metatype: CreatePaymentMethodDto,
  })) as CreatePaymentMethodDto;
}

async function rejectionMessages(
  payload: Record<string, unknown>,
): Promise<string> {
  try {
    await parse(payload);
  } catch (error) {
    if (error instanceof BadRequestException) {
      const { message } = error.getResponse() as { message: string[] };
      return message.join(" | ");
    }
    throw error;
  }
  throw new Error("Expected the payload to be rejected");
}

describe("CreatePaymentMethodDto", () => {
  describe("valid payloads", () => {
    it("accepts a code and a name", async () => {
      const dto = await parse(validPayload);

      expect(dto).toBeInstanceOf(CreatePaymentMethodDto);
      expect(dto).toEqual(validPayload);
    });

    it("trims the spaces around the code and the name", async () => {
      await expect(
        parse({ code: "  NEQUI  ", name: "  Nequi  " }),
      ).resolves.toEqual(validPayload);
    });

    it("accepts a code with underscores and digits", async () => {
      const code = "BANK_TRANSFER_2";

      await expect(parse({ ...validPayload, code })).resolves.toMatchObject({
        code,
      });
    });

    it("accepts a name of 100 characters", async () => {
      const name = "N".repeat(100);

      await expect(parse({ ...validPayload, name })).resolves.toMatchObject({
        name,
      });
    });
  });

  describe("code format", () => {
    const invalidCodes: Array<[string, unknown]> = [
      ["a lowercase code", "nequi"],
      ["a mixed case code", "Nequi"],
      ["a code with a space", "NE QUI"],
      ["a code with a hyphen", "NE-QUI"],
      ["an empty code", ""],
      ["a code made only of spaces", "   "],
      ["a code above 30 characters", "A".repeat(31)],
      ["a code that is not a string", 123],
    ];

    it.each(invalidCodes)("rejects %s", async (_label, code) => {
      const messages = await rejectionMessages({ ...validPayload, code });

      expect(messages).toContain("code");
    });
  });

  describe("required fields", () => {
    const missingFields: Array<[string, Record<string, unknown>]> = [
      ["code", { name: "Nequi" }],
      ["name", { code: "NEQUI" }],
    ];

    it.each(missingFields)(
      "rejects a request missing %s",
      async (field, payload) => {
        const messages = await rejectionMessages(payload);

        expect(messages).toContain(field);
      },
    );

    it("rejects a name made only of spaces", async () => {
      const messages = await rejectionMessages({
        ...validPayload,
        name: "     ",
      });

      expect(messages).toContain("name");
    });

    it("rejects a name above 100 characters", async () => {
      const messages = await rejectionMessages({
        ...validPayload,
        name: "N".repeat(101),
      });

      expect(messages).toContain("name");
    });

    it("rejects a name that is not a string", async () => {
      const messages = await rejectionMessages({
        ...validPayload,
        name: 123,
      });

      expect(messages).toContain("name");
    });
  });

  describe("unknown fields", () => {
    it.each(["active", "id"])("rejects the unknown field %s", async (field) => {
      const messages = await rejectionMessages({
        ...validPayload,
        [field]: true,
      });

      expect(messages).toContain(field);
    });
  });
});
