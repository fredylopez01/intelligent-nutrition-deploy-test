import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { BranchesService } from "./branches.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "8f5c2d0e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";

const prisma = {
  branch: { findUnique: jest.fn<AsyncMock>() },
  branchInventory: { groupBy: jest.fn<AsyncMock>() },
};

describe("BranchesService sellable products", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-25T15:00:00.000Z") });
    jest.resetAllMocks();
    prisma.branch.findUnique.mockResolvedValue({ id: branchId });
    prisma.branchInventory.groupBy.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts only the lots that are not expired as available", async () => {
    const service = new BranchesService(prisma as never, {} as never);

    await service.findSellableProducts(branchId, {
      page: 1,
      limit: 20,
    });

    expect(prisma.branchInventory.groupBy).toHaveBeenCalledWith({
      by: ["productId"],
      where: {
        branchId,
        expirationDate: { gte: new Date("2026-10-25T00:00:00.000Z") },
      },
      _sum: { quantity: true },
    });
  });
});
