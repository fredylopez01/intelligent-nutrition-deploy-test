import { describe, it, expect } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ListProductsQueryDto } from "./list-products-query.dto.js";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function parse(query: Record<string, unknown>) {
  return (await pipe.transform(query, {
    type: "query",
    metatype: ListProductsQueryDto,
  })) as ListProductsQueryDto;
}

describe("ListProductsQueryDto active filter", () => {
  it("reads active=true as true", async () => {
    await expect(parse({ active: "true" })).resolves.toMatchObject({
      active: true,
    });
  });

  it("reads active=false as false", async () => {
    await expect(parse({ active: "false" })).resolves.toMatchObject({
      active: false,
    });
  });

  it("leaves active undefined when it is not sent", async () => {
    const dto = await parse({});

    expect(dto.active).toBeUndefined();
  });

  it("rejects a value that is not true or false", async () => {
    await expect(parse({ active: "maybe" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
