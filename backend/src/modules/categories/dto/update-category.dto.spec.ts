import { describe, it, expect } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { UpdateCategoryDto } from "./update-category.dto.js";

// Same options as the global pipe in app.setup.ts, so the DTO is exercised the
// way the API receives it.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function parse(payload: Record<string, unknown>) {
  return (await pipe.transform(payload, {
    type: "body",
    metatype: UpdateCategoryDto,
  })) as UpdateCategoryDto;
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

describe("UpdateCategoryDto", () => {
  describe("partial edits", () => {
    it("accepts only the name", async () => {
      const dto = await parse({ name: "Proteínas Premium" });

      expect(dto).toBeInstanceOf(UpdateCategoryDto);
      expect(dto).toEqual({ name: "Proteínas Premium" });
    });

    it("accepts only the description", async () => {
      await expect(
        parse({ description: "Nueva descripción" }),
      ).resolves.toEqual({ description: "Nueva descripción" });
    });

    it("accepts the name and the description together", async () => {
      const payload = { name: "Proteínas Premium", description: "Nueva" };

      await expect(parse(payload)).resolves.toEqual(payload);
    });

    // The "at least one field" rule is enforced by the service, not the DTO.
    it("lets an empty body through to the service", async () => {
      await expect(parse({})).resolves.toEqual({});
    });
  });

  describe("limits", () => {
    it("accepts a name of 3 characters", async () => {
      await expect(parse({ name: "Pro" })).resolves.toEqual({ name: "Pro" });
    });

    it("accepts a name of 100 characters", async () => {
      const name = "N".repeat(100);

      await expect(parse({ name })).resolves.toEqual({ name });
    });

    it("accepts a description of 255 characters", async () => {
      const description = "D".repeat(255);

      await expect(parse({ description })).resolves.toEqual({ description });
    });

    // Known defect (Contract API Sprint 4, §3.2 and HS-069): the name must
    // have 2 to 100 characters, but the DTO requires at least 3.
    it.failing("accepts a name of 2 characters", async () => {
      await expect(parse({ name: "Pr" })).resolves.toEqual({ name: "Pr" });
    });

    // Known defect (Contract API Sprint 4, §3.2): the name is unique ignoring
    // surrounding spaces, but the DTO keeps them.
    it.failing("trims the spaces around the name", async () => {
      await expect(parse({ name: "  Proteínas  " })).resolves.toEqual({
        name: "Proteínas",
      });
    });
  });

  describe("invalid payloads", () => {
    const invalidPayloads: Array<[string, Record<string, unknown>, string]> = [
      ["an empty name", { name: "" }, "name"],
      ["a name of 1 character", { name: "P" }, "name"],
      ["a name above 100 characters", { name: "N".repeat(101) }, "name"],
      ["a name that is not a string", { name: 123 }, "name"],
      ["a null name", { name: null }, "name"],
      ["an empty description", { description: "" }, "description"],
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
      [
        "an unknown active field",
        { name: "Proteínas", active: false },
        "active",
      ],
      ["an unknown id field", { name: "Proteínas", id: "other-id" }, "id"],
    ];

    it.each(invalidPayloads)("rejects %s", async (_label, payload, field) => {
      const messages = await rejectionMessages(payload);

      expect(messages).toContain(field);
    });

    // Known defect (Contract API Sprint 4, §3.2): the name cannot be blank, but
    // a name made only of spaces passes `@IsNotEmpty` and the length check.
    it.failing("rejects a name made only of spaces", async () => {
      await expect(rejectionMessages({ name: "     " })).resolves.toContain(
        "name",
      );
    });
  });
});
