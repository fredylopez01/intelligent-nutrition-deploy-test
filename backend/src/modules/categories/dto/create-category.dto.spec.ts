import { describe, it, expect } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { CreateCategoryDto } from "./create-category.dto.js";

// Same options as the global pipe in app.setup.ts, so the DTO is exercised the
// way the API receives it.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const validPayload = {
  name: "Proteínas",
  description: "Suplementos de proteína",
};

async function parse(payload: Record<string, unknown>) {
  return (await pipe.transform(payload, {
    type: "body",
    metatype: CreateCategoryDto,
  })) as CreateCategoryDto;
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

describe("CreateCategoryDto", () => {
  describe("valid payloads", () => {
    it("accepts a name with a description", async () => {
      const dto = await parse(validPayload);

      expect(dto).toBeInstanceOf(CreateCategoryDto);
      expect(dto).toEqual(validPayload);
    });

    it("accepts a name of 3 characters", async () => {
      await expect(parse({ ...validPayload, name: "Pro" })).resolves.toEqual({
        ...validPayload,
        name: "Pro",
      });
    });

    it("accepts a name of 100 characters", async () => {
      const name = "N".repeat(100);

      await expect(parse({ ...validPayload, name })).resolves.toMatchObject({
        name,
      });
    });

    it("accepts a description of 255 characters", async () => {
      const description = "D".repeat(255);

      await expect(
        parse({ ...validPayload, description }),
      ).resolves.toMatchObject({ description });
    });

    // Known defect (Contract API Sprint 4, §3.2 and HS-067): the name must
    // have 2 to 100 characters, but the DTO requires at least 3.
    it.failing("accepts a name of 2 characters", async () => {
      await expect(
        parse({ ...validPayload, name: "Pr" }),
      ).resolves.toMatchObject({ name: "Pr" });
    });

    // Known defect (Contract API Sprint 4, §3.2 and HS-067): the description is
    // optional, but the DTO validates it as a required non-empty string.
    it.failing("accepts a category without description", async () => {
      await expect(parse({ name: "Proteínas" })).resolves.toMatchObject({
        name: "Proteínas",
      });
    });

    // Known defect (Contract API Sprint 4, §3.2): the name is unique ignoring
    // surrounding spaces, but the DTO keeps them, so " Proteínas " is stored
    // as a different name than "Proteínas".
    it.failing("trims the spaces around the name", async () => {
      await expect(
        parse({ ...validPayload, name: "  Proteínas  " }),
      ).resolves.toMatchObject({ name: "Proteínas" });
    });
  });

  describe("invalid payloads", () => {
    const invalidPayloads: Array<[string, Record<string, unknown>, string]> = [
      ["a missing name", { name: undefined }, "name"],
      ["an empty name", { name: "" }, "name"],
      ["a name of 1 character", { name: "P" }, "name"],
      ["a name above 100 characters", { name: "N".repeat(101) }, "name"],
      ["a name that is not a string", { name: 123 }, "name"],
      [
        "a description above 255 characters",
        { description: "D".repeat(256) },
        "description",
      ],
      [
        "a description that is not a string",
        { description: 123 },
        "description",
      ],
      ["an unknown active field", { active: false }, "active"],
      ["an unknown id field", { id: "someone-elses-id" }, "id"],
    ];

    it.each(invalidPayloads)("rejects %s", async (_label, override, field) => {
      const messages = await rejectionMessages({
        ...validPayload,
        ...override,
      });

      expect(messages).toContain(field);
    });

    // Known defect (Contract API Sprint 4, §3.2): the name is required, but a
    // name made only of spaces passes `@IsNotEmpty` and the length check.
    it.failing("rejects a name made only of spaces", async () => {
      await expect(
        rejectionMessages({ ...validPayload, name: "     " }),
      ).resolves.toContain("name");
    });
  });
});
