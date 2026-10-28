import {
  BadRequestException,
  ValidationPipe,
} from "@nestjs/common";
import { describe, expect, it } from "@jest/globals";
import { AvailabilityQueryDto } from "./availability-query.dto.js";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const PRODUCT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function parse(query: Record<string, unknown>) {
  return (await pipe.transform(query, {
    type: "query",
    metatype: AvailabilityQueryDto,
  })) as AvailabilityQueryDto;
}

describe("AvailabilityQueryDto", () => {
  describe("productId", () => {
    it("accepts a valid UUID v4 for productId", async () => {
      const dto = await parse({ productId: PRODUCT_UUID });

      expect(dto.productId).toBe(PRODUCT_UUID);
    });

    it("rejects when productId is missing", async () => {
      await expect(parse({})).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a non-UUID string for productId", async () => {
      await expect(
        parse({ productId: "not-a-uuid" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a UUID that is not version 4", async () => {
      await expect(
        parse({ productId: "00000000-0000-1000-8000-000000000000" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("excludeBranchId", () => {
    it("is optional — omitting it leaves the field undefined", async () => {
      const dto = await parse({ productId: PRODUCT_UUID });

      expect(dto.excludeBranchId).toBeUndefined();
    });

    it("accepts a valid UUID v4 for excludeBranchId", async () => {
      const dto = await parse({
        productId: PRODUCT_UUID,
        excludeBranchId: BRANCH_UUID,
      });

      expect(dto.excludeBranchId).toBe(BRANCH_UUID);
    });

    it("rejects a non-UUID string for excludeBranchId", async () => {
      await expect(
        parse({ productId: PRODUCT_UUID, excludeBranchId: "not-a-uuid" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("unknown fields", () => {
    it("rejects queries that include undeclared fields", async () => {
      await expect(
        parse({ productId: PRODUCT_UUID, extra: "value" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
