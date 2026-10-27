import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ValidationPipe } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateCountsDto } from "./dto/update-counts.dto.js";
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

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

function validateBody(body: Record<string, unknown>) {
  return validationPipe.transform(body, {
    type: "body",
    metatype: UpdateCountsDto,
  }) as Promise<UpdateCountsDto>;
}

const count = (
  expirationDate: string,
  physicalQuantity: number,
  observation?: string,
) => ({ productId: wheyId, expirationDate, physicalQuantity, observation });

describe("InventoryClosuresService.updateCounts", () => {
  let service: InventoryClosuresService;
  const pending = closure([lot("2026-09-30", 2), lot("2027-06-30", 8)]);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((arg) =>
      (arg as (client: typeof tx) => Promise<unknown>)(tx),
    );
    tx.inventoryClosure.findUnique.mockResolvedValue(pending);
    tx.inventoryClosure.findUniqueOrThrow.mockResolvedValue(
      closure([lot("2026-09-30", 2, 0), lot("2027-06-30", 8, 7)]),
    );
    service = new InventoryClosuresService(prisma as never, audit as never);
  });

  it("stores the count of each lot with its difference and observation", async () => {
    await service.updateCounts(
      closureId,
      {
        items: [
          count("2027-06-30", 7, "Una unidad abierta"),
          count("2026-09-30", 0),
        ],
      },
      assistant,
    );

    expect(tx.inventoryClosureDetail.update).toHaveBeenCalledWith({
      where: { id: "detail-2027-06-30" },
      data: {
        physicalQuantity: 7,
        difference: -1,
        observation: "Una unidad abierta",
      },
    });
    expect(tx.inventoryClosureDetail.update).toHaveBeenCalledWith({
      where: { id: "detail-2026-09-30" },
      data: { physicalQuantity: 0, difference: -2, observation: null },
    });
  });

  it("keeps the answer blind while the closure is pending", async () => {
    const result = await service.updateCounts(
      closureId,
      { items: [count("2027-06-30", 7)] },
      leader,
    );

    expect(result).toMatchObject({
      status: "PENDING",
      countedItems: 2,
      totalItems: 2,
    });
    for (const item of result.items) {
      expect(item).not.toHaveProperty("systemQuantity");
      expect(item).not.toHaveProperty("difference");
    }
  });

  it("accepts saving only part of the lots", async () => {
    await service.updateCounts(
      closureId,
      { items: [count("2027-06-30", 8)] },
      leader,
    );

    expect(tx.inventoryClosureDetail.update).toHaveBeenCalledTimes(1);
  });

  it("rejects a lot that is not part of the closure", async () => {
    await expect(
      service.updateCounts(
        closureId,
        { items: [count("2028-01-01", 3)] },
        leader,
      ),
    ).rejects.toMatchObject({
      response: {
        code: "PRODUCT_NOT_IN_CLOSURE",
        details: { productId: wheyId, expirationDate: "2028-01-01" },
      },
    });
    expect(tx.inventoryClosureDetail.update).not.toHaveBeenCalled();
  });

  it("rejects the same lot twice", async () => {
    await expect(
      service.updateCounts(
        closureId,
        { items: [count("2027-06-30", 3), count("2027-06-30", 4)] },
        leader,
      ),
    ).rejects.toMatchObject({ response: { code: "DUPLICATED_ITEM" } });
  });

  it.each([
    ["confirmed", closure([lot("2027-06-30", 8, 8)], "CONFIRMED")],
    [
      "locked by the nightly job",
      closure([lot("2027-06-30", 8)], "NOT_CONFIRMED"),
    ],
  ])(
    "rejects counting a %s closure with CLOSURE_LOCKED",
    async (_label, locked) => {
      tx.inventoryClosure.findUnique.mockResolvedValue(locked);

      await expect(
        service.updateCounts(
          closureId,
          { items: [count("2027-06-30", 3)] },
          leader,
        ),
      ).rejects.toMatchObject({ response: { code: "CLOSURE_LOCKED" } });
    },
  );

  it("rejects a closure of another branch", async () => {
    await expect(
      service.updateCounts(
        closureId,
        { items: [count("2027-06-30", 3)] },
        outsider,
      ),
    ).rejects.toMatchObject({ response: { code: "BRANCH_SCOPE_VIOLATION" } });
  });

  it("answers CLOSURE_NOT_FOUND", async () => {
    tx.inventoryClosure.findUnique.mockResolvedValue(null);

    await expect(
      service.updateCounts(
        closureId,
        { items: [count("2027-06-30", 3)] },
        leader,
      ),
    ).rejects.toMatchObject({ response: { code: "CLOSURE_NOT_FOUND" } });
  });

  it("does not write an audit log for every save", async () => {
    await service.updateCounts(
      closureId,
      { items: [count("2027-06-30", 8)] },
      leader,
    );

    expect(audit.createAuditLog).not.toHaveBeenCalled();
  });

  describe("DTO validation", () => {
    it("accepts a zero count and trims the observation", async () => {
      await expect(
        validateBody({ items: [count("2027-06-30", 0, "  vacío  ")] }),
      ).resolves.toMatchObject({
        items: [{ physicalQuantity: 0, observation: "vacío" }],
      });
    });

    it.each([
      ["an empty list", { items: [] }],
      ["the old counts field", { counts: [count("2027-06-30", 1)] }],
      ["a negative count", { items: [count("2027-06-30", -1)] }],
      ["a decimal count", { items: [count("2027-06-30", 1.5)] }],
      [
        "a missing lot",
        { items: [{ productId: wheyId, physicalQuantity: 1 }] },
      ],
      ["an invalid lot date", { items: [count("30/06/2027", 1)] }],
      [
        "a non-UUID product",
        { items: [{ ...count("2027-06-30", 1), productId: "whey" }] },
      ],
    ])("rejects %s", async (_label, body) => {
      await expect(validateBody(body)).rejects.toThrow();
    });
  });
});
