import { describe, it, expect } from "@jest/globals";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ListBranchInventoryQueryDto } from "./list-branch-inventory-query.dto.js";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function parse(query: Record<string, unknown>) {
  return (await pipe.transform(query, {
    type: "query",
    metatype: ListBranchInventoryQueryDto,
  })) as ListBranchInventoryQueryDto;
}

describe("ListBranchInventoryQueryDto boolean filters", () => {
  it("reads lowStock=true as true and lowStock=false as false", async () => {
    await expect(parse({ lowStock: "true" })).resolves.toMatchObject({
      lowStock: true,
    });
    await expect(parse({ lowStock: "false" })).resolves.toMatchObject({
      lowStock: false,
    });
  });

  it("reads productActive=false as false", async () => {
    await expect(parse({ productActive: "false" })).resolves.toMatchObject({
      productActive: false,
    });
  });

  it("keeps the defaults when the filters are not sent", async () => {
    const dto = await parse({});

    expect(dto.lowStock).toBeUndefined();
    expect(dto.productActive).toBe(true);
  });

  it("rejects a value that is not true or false", async () => {
    await expect(parse({ lowStock: "maybe" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
