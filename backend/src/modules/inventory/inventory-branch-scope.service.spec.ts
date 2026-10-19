import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma/client.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { InventoryService } from "./inventory.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "8f5c2d0e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";
const otherBranchId = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const productId = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

const prismaMock = {
  branchInventory: { findMany: jest.fn<AsyncMock>() },
};
const auditMock = { createAuditLog: jest.fn<AsyncMock>() };

function userWithRole(
  name: string,
  branches: Array<{ id: string; name: string }> = [],
): AuthenticatedUser {
  return { id: "user-id", active: true, role: { name }, branches };
}

const lot = {
  id: "lot-id",
  branchId,
  productId,
  quantity: 4,
  minimumStock: 6,
  expirationDate: new Date("2026-12-31T00:00:00Z"),
  updatedAt: new Date("2026-10-07T15:30:00Z"),
  product: {
    id: productId,
    name: "Whey Protein 2 lb",
    referenceCode: "WHEY-2LB-001",
    active: true,
    price: new Prisma.Decimal("145000"),
    category: { id: "category-id", name: "Proteínas" },
    unitOfMeasure: { abreviation: "und" },
  },
};

describe("InventoryService branch scope", () => {
  let service: InventoryService;

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.branchInventory.findMany.mockResolvedValue([lot]);
    service = new InventoryService(prismaMock as never, auditMock as never);
  });

  it("lets a branch assistant read the inventory of an assigned branch without thresholds", async () => {
    const result = await service.findOneByBranchAndProduct(
      branchId,
      productId,
      userWithRole("BRANCH_ASSISTANT", [{ id: branchId, name: "Centro" }]),
    );

    expect(result.data.totalQuantity).toBe(4);
    expect(result.data).not.toHaveProperty("minimumStock");
    expect(result.data).not.toHaveProperty("lowStock");
  });

  it("rejects a branch assistant reading a branch they are not assigned to", async () => {
    await expect(
      service.findOneByBranchAndProduct(
        branchId,
        productId,
        userWithRole("BRANCH_ASSISTANT", [
          { id: otherBranchId, name: "Norte" },
        ]),
      ),
    ).rejects.toMatchObject({
      response: { code: "BRANCH_OUT_OF_SCOPE" },
    });
    expect(prismaMock.branchInventory.findMany).not.toHaveBeenCalled();
  });

  it("shows the thresholds to a branch leader of the branch", async () => {
    const result = await service.findOneByBranchAndProduct(
      branchId,
      productId,
      userWithRole("BRANCH_LEADER", [{ id: branchId, name: "Centro" }]),
    );

    expect(result.data).toMatchObject({ minimumStock: 6, lowStock: true });
  });

  it("keeps rejecting roles without branch access", async () => {
    await expect(
      service.findOneByBranchAndProduct(
        branchId,
        productId,
        userWithRole("DEV", [{ id: branchId, name: "Centro" }]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
