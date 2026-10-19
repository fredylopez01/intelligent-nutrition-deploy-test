import { describe, it, expect } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { CreateUnitMeasureDto } from "./create-unit-measure.dto.js";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const validPayload = { name: "Kilogramo", abreviation: "kg" };

async function parse(payload: Record<string, unknown>) {
  return (await pipe.transform(payload, {
    type: "body",
    metatype: CreateUnitMeasureDto,
  })) as CreateUnitMeasureDto;
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

describe("CreateUnitMeasureDto", () => {
  it("accepts a valid name and abreviation", async () => {
    const dto = await parse(validPayload);

    expect(dto).toBeInstanceOf(CreateUnitMeasureDto);
    expect(dto).toEqual(validPayload);
  });

  it.each([
    ["a missing name", { name: undefined }, "name"],
    ["an empty name", { name: "" }, "name"],
    ["a name shorter than 5 characters", { name: "Gram" }, "name"],
    ["a name above 50 characters", { name: "N".repeat(51) }, "name"],
    ["a non-string name", { name: 123 }, "name"],
    ["a missing abreviation", { abreviation: undefined }, "abreviation"],
    ["an empty abreviation", { abreviation: "" }, "abreviation"],
    [
      "an abreviation above 10 characters",
      { abreviation: "A".repeat(11) },
      "abreviation",
    ],
    ["a non-string abreviation", { abreviation: 123 }, "abreviation"],
  ])("rejects %s", async (_label, override, field) => {
    const messages = await rejectionMessages({
      ...validPayload,
      ...override,
    });

    expect(messages).toContain(field);
  });
});
