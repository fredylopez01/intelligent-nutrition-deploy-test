import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

import { InventoryClosuresService } from "./inventory-closures.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const branchId = "11111111-1111-4111-8111-111111111111";
const otherBranchId = "44444444-4444-4444-8444-444444444444";
const closureId = "33333333-3333-4333-8333-333333333333";
const wheyId = "55555555-5555-4555-8555-555555555555";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

const leader: AuthenticatedUser = {
  id: "leader-id",
  active: true,
  role: { name: "BRANCH_LEADER" },
  branches: [{ id: branchId, name: "Centro" }],
};
const assistant: AuthenticatedUser = {
  id: "assistant-id",
  active: true,
  role: { name: "BRANCH_ASSISTANT" },
  branches: [{ id: branchId, name: "Centro" }],
};
const outsider: AuthenticatedUser = {
  id: "outsider-id",
  active: true,
  role: { name: "BRANCH_ASSISTANT" },
  branches: [{ id: otherBranchId, name: "Norte" }],
};

const tx = {
  inventoryClosure: {
    findUnique: jest.fn<AsyncMock>(),
    findUniqueOrThrow: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
  },
  inventoryClosureDetail: { update: jest.fn<AsyncMock>() },
};
const prisma = {
  $transaction: jest.fn<(arg: unknown) => Promise<unknown>>(),
};
const audit = { createAuditLog: jest.fn<AsyncMock>() };

function lot(
  expirationDate: string,
  systemQuantity: number,
  physicalQuantity: number | null = null,
) {
  return {
    id: `detail-${expirationDate}`,
    productId: wheyId,
    expirationDate: day(expirationDate),
    systemQuantity,
    physicalQuantity,
    difference:
      physicalQuantity === null ? null : physicalQuantity - systemQuantity,
    observation: null,
    product: {
      name: "Whey Protein 2 lb",
      referenceCode: "WHEY",
      unitOfMeasure: { abreviation: "und" },
    },
  };
}

function closure(
  details: ReturnType<typeof lot>[],
  status: "PENDING" | "CONFIRMED" | "NOT_CONFIRMED" = "PENDING",
  locked = status !== "PENDING",
) {
  return {
    id: closureId,
    branchId,
    closureDate: day("2026-10-26"),
    status,
    confirmed: status === "CONFIRMED",
    locked,
    closedAt: null,
    branch: { name: "Centro" },
    user: { person: { firstName: "Laura", lastName: null } },
    details,
  };
}

const superadmin: AuthenticatedUser = {
  id: "admin-id",
  active: true,
  role: { name: "SUPERADMIN" },
};

describe("InventoryClosuresService.confirm", () => {
  let service: InventoryClosuresService;
  const counted = closure([lot("2026-09-30", 2, 0), lot("2027-06-30", 8, 9)]);

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-27T01:30:00.000Z") });
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg) =>
      (arg as (client: typeof tx) => Promise<unknown>)(tx),
    );
    tx.inventoryClosure.findUnique.mockResolvedValue(counted);
    tx.inventoryClosure.update.mockResolvedValue({
      ...counted,
      status: "CONFIRMED",
      confirmed: true,
      locked: true,
      closedAt: new Date("2026-10-27T01:30:00.000Z"),
    });
    service = new InventoryClosuresService(prisma as never, audit as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("recalculates every difference and locks the closure as confirmed", async () => {
    await service.confirm(closureId, assistant, "10.0.0.1");

    expect(tx.inventoryClosureDetail.update).toHaveBeenCalledWith({
      where: { id: "detail-2026-09-30" },
      data: { difference: -2 },
    });
    expect(tx.inventoryClosureDetail.update).toHaveBeenCalledWith({
      where: { id: "detail-2027-06-30" },
      data: { difference: 1 },
    });
    expect(tx.inventoryClosure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: closureId },
        data: {
          status: "CONFIRMED",
          confirmed: true,
          locked: true,
          closedAt: new Date("2026-10-27T01:30:00.000Z"),
        },
      }),
    );
  });

  it("records the confirmation in the audit log", async () => {
    await service.confirm(closureId, leader, "10.0.0.1");

    expect(audit.createAuditLog).toHaveBeenCalledWith(
      {
        userId: "leader-id",
        action: "CONFIRM",
        entity: "INVENTORY_CLOSURE",
        entityId: closureId,
        oldData: { status: "PENDING" },
        newData: {
          status: "CONFIRMED",
          closureDate: "2026-10-26",
          countedLots: 2,
          lotsWithDifference: 2,
        },
        reason: "Inventory closure of Centro confirmed",
        ipAddress: "10.0.0.1",
      },
      tx,
    );
  });

  it("shows the differences report to the leader", async () => {
    const result = await service.confirm(closureId, leader);

    expect(result).toMatchObject({ status: "CONFIRMED", totalDifferences: 2 });
    expect(result.items).toEqual([
      expect.objectContaining({
        expirationDate: "2026-09-30",
        systemQuantity: 2,
        difference: -2,
      }),
      expect.objectContaining({
        expirationDate: "2027-06-30",
        systemQuantity: 8,
        difference: 1,
      }),
    ]);
  });

  it("keeps the report blind for the assistant who confirms", async () => {
    const result = await service.confirm(closureId, assistant);

    expect(result.items[0]).not.toHaveProperty("systemQuantity");
    expect(result).not.toHaveProperty("totalDifferences");
  });

  it("lists the lots still missing a count with INCOMPLETE_COUNT", async () => {
    tx.inventoryClosure.findUnique.mockResolvedValue(
      closure([lot("2026-09-30", 2, 0), lot("2027-06-30", 8)]),
    );

    await expect(service.confirm(closureId, leader)).rejects.toMatchObject({
      response: {
        code: "INCOMPLETE_COUNT",
        details: {
          pending: [
            {
              productId: wheyId,
              productName: "Whey Protein 2 lb",
              expirationDate: "2027-06-30",
            },
          ],
        },
      },
    });
    expect(tx.inventoryClosure.update).not.toHaveBeenCalled();
  });

  it.each(["CONFIRMED", "NOT_CONFIRMED"] as const)(
    "rejects confirming a %s closure again",
    async (status) => {
      tx.inventoryClosure.findUnique.mockResolvedValue(
        closure([lot("2027-06-30", 8, 8)], status),
      );

      await expect(service.confirm(closureId, leader)).rejects.toMatchObject({
        response: { code: "CLOSURE_LOCKED" },
      });
    },
  );

  it("confirms a closure without lots", async () => {
    tx.inventoryClosure.findUnique.mockResolvedValue(closure([]));
    tx.inventoryClosure.update.mockResolvedValue(closure([], "CONFIRMED"));

    await expect(service.confirm(closureId, leader)).resolves.toMatchObject({
      status: "CONFIRMED",
      totalItems: 0,
    });
  });

  it("checks the branch scope", async () => {
    await expect(service.confirm(closureId, outsider)).rejects.toMatchObject({
      response: { code: "BRANCH_SCOPE_VIOLATION" },
    });
  });

  it("lets the superadmin read but the controller keeps confirmation to branch roles", async () => {
    await expect(service.confirm(closureId, superadmin)).resolves.toBeDefined();
  });

  it("propagates an audit failure so the transaction rolls back", async () => {
    audit.createAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(service.confirm(closureId, leader)).rejects.toThrow(
      "audit down",
    );
  });
});
