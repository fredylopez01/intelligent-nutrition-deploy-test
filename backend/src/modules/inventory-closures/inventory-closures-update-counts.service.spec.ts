import "reflect-metadata";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ValidationPipe } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateCountsDto } from "./dto/update-counts.dto.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
type TransactionCallback = (client: typeof transactionMock) => Promise<unknown>;

const branchId   = "11111111-1111-4111-8111-111111111111";
const userId     = "22222222-2222-4222-8222-222222222222";
const closureId  = "33333333-3333-4333-8333-333333333333";
const productAId = "44444444-4444-4444-8444-444444444444";
const productBId = "55555555-5555-4555-8555-555555555555";
const detailAId  = "66666666-6666-4666-8666-666666666666";
const detailBId  = "77777777-7777-4777-8777-777777777777";

const today = new Date("2026-10-23T00:00:00.000Z");

const productA = {
  name: "Proteína",
  referenceCode: "P-001",
  unitOfMeasure: { abreviation: "kg" },
};
const productB = {
  name: "Creatina",
  referenceCode: "P-002",
  unitOfMeasure: { abreviation: "g" },
};

const pendingClosure = {
  id: closureId,
  branchId,
  status: "PENDING",
  locked: false,
  details: [
    { id: detailAId, productId: productAId, systemQuantity: 7 },
    { id: detailBId, productId: productBId, systemQuantity: 5 },
  ],
};

const updatedClosureRecord = {
  id: closureId,
  branchId,
  closureDate: today,
  status: "PENDING",
  confirmed: false,
  locked: false,
  closedAt: null,
  details: [
    {
      productId: productAId,
      physicalQuantity: 8,
      observation: null,
      product: productA,
    },
    {
      productId: productBId,
      physicalQuantity: 4,
      observation: "Vencimiento próximo",
      product: productB,
    },
  ],
};

const transactionMock = {
  inventoryClosure: {
    findUnique: jest.fn<AsyncMock>(),
  },
  inventoryClosureDetail: {
    update: jest.fn<AsyncMock>(),
  },
};

const prismaMock = {
  $transaction:
    jest.fn<(callback: TransactionCallback) => Promise<unknown>>(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

jest.unstable_mockModule("../../database/prisma/prisma.service.js", () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

const { Test }                       = await import("@nestjs/testing");
const { PrismaService }              = await import("../../database/prisma/prisma.service.js");
const { AuditService }               = await import("../audit/audit.service.js");
const { InventoryClosuresService }   = await import("./inventory-closures.service.js");

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const superadmin: AuthenticatedUser = {
  id: userId,
  active: true,
  role: { name: "SUPERADMIN" },
};

const userWithRole = (
  roleName: string,
  assignedBranchIds: string[] = [],
): AuthenticatedUser => ({
  id: userId,
  active: true,
  role: { name: roleName },
  branches: assignedBranchIds.map((id) => ({ id, name: "Sede Centro" })),
});

function validDto(): UpdateCountsDto {
  return {
    counts: [
      { productId: productAId, physicalQuantity: 8 },
      { productId: productBId, physicalQuantity: 4, observation: "Vencimiento próximo" },
    ],
  } as UpdateCountsDto;
}

async function validateBody(body: Record<string, unknown>) {
  return validationPipe.transform(body, {
    type: "body",
    metatype: UpdateCountsDto,
  }) as Promise<UpdateCountsDto>;
}

const ipAddress = "127.0.0.1";

describe("InventoryClosuresService.updateCounts", () => {
  let service: InstanceType<typeof InventoryClosuresService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation((callback) =>
      callback(transactionMock),
    );

    transactionMock.inventoryClosure.findUnique
      .mockResolvedValueOnce(pendingClosure)
      .mockResolvedValueOnce(updatedClosureRecord);

    transactionMock.inventoryClosureDetail.update.mockResolvedValue({});
    auditMock.createAuditLog.mockResolvedValue({});

    testingModule = await Test.createTestingModule({
      providers: [
        InventoryClosuresService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = testingModule.get(InventoryClosuresService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  describe("closure lookup", () => {
    it("rejects when the closure does not exist", async () => {
      transactionMock.inventoryClosure.findUnique.mockReset();
      transactionMock.inventoryClosure.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCounts(closureId, validDto(), superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "CLOSURE_NOT_FOUND" },
      });

      expect(transactionMock.inventoryClosureDetail.update).not.toHaveBeenCalled();
    });
  });

  describe("authorization", () => {
    it("allows SUPERADMIN to update counts for any branch closure", async () => {
      await expect(
        service.updateCounts(closureId, validDto(), superadmin, ipAddress),
      ).resolves.toBeDefined();
    });

    it("allows DEV to update counts for any branch closure", async () => {
      await expect(
        service.updateCounts(closureId, validDto(), userWithRole("DEV"), ipAddress),
      ).resolves.toBeDefined();
    });

    it("allows BRANCH_LEADER assigned to the closure branch", async () => {
      const leader = userWithRole("BRANCH_LEADER", [branchId]);

      await expect(
        service.updateCounts(closureId, validDto(), leader, ipAddress),
      ).resolves.toBeDefined();
    });

    it("rejects BRANCH_LEADER not assigned to the closure branch", async () => {
      const leader = userWithRole("BRANCH_LEADER", ["99999999-9999-4999-8999-999999999999"]);

      await expect(
        service.updateCounts(closureId, validDto(), leader, ipAddress),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: "FORBIDDEN_BRANCH" },
      });
    });

    it("rejects BRANCH_ASSISTANT not assigned to the closure branch", async () => {
      const assistant = userWithRole("BRANCH_ASSISTANT");

      await expect(
        service.updateCounts(closureId, validDto(), assistant, ipAddress),
      ).rejects.toMatchObject({
        status: 403,
        response: { code: "FORBIDDEN_BRANCH" },
      });
    });
  });

  describe("closure state validation", () => {
    it("rejects when the closure status is not PENDING", async () => {
      transactionMock.inventoryClosure.findUnique.mockReset();
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        ...pendingClosure,
        status: "CONFIRMED",
      });

      await expect(
        service.updateCounts(closureId, validDto(), superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: "CLOSURE_NOT_PENDING" },
      });

      expect(transactionMock.inventoryClosureDetail.update).not.toHaveBeenCalled();
    });

    it("rejects when the closure is locked", async () => {
      transactionMock.inventoryClosure.findUnique.mockReset();
      transactionMock.inventoryClosure.findUnique.mockResolvedValue({
        ...pendingClosure,
        locked: true,
      });

      await expect(
        service.updateCounts(closureId, validDto(), superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: "CLOSURE_LOCKED" },
      });

      expect(transactionMock.inventoryClosureDetail.update).not.toHaveBeenCalled();
    });
  });

  describe("counts payload validation", () => {
    it("rejects when counts contain duplicated productIds", async () => {
      const dto: UpdateCountsDto = {
        counts: [
          { productId: productAId, physicalQuantity: 5 },
          { productId: productAId, physicalQuantity: 8 },
        ],
      } as UpdateCountsDto;

      await expect(
        service.updateCounts(closureId, dto, superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: "DUPLICATED_PRODUCT" },
      });

      expect(transactionMock.inventoryClosureDetail.update).not.toHaveBeenCalled();
    });

    it("rejects when a productId in counts is not part of the closure", async () => {
      const unknownProductId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const dto: UpdateCountsDto = {
        counts: [{ productId: unknownProductId, physicalQuantity: 3 }],
      } as UpdateCountsDto;

      await expect(
        service.updateCounts(closureId, dto, superadmin, ipAddress),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: "PRODUCT_NOT_IN_CLOSURE" },
      });

      expect(transactionMock.inventoryClosureDetail.update).not.toHaveBeenCalled();
    });
  });

  describe("happy path", () => {
    it("updates each detail with the correct physicalQuantity and calculated difference", async () => {
      await service.updateCounts(closureId, validDto(), superadmin, ipAddress);

      expect(transactionMock.inventoryClosureDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: detailAId },
          data:  expect.objectContaining({
            physicalQuantity: 8,
            difference:       1,   // 8 - 7
          }),
        }),
      );

      expect(transactionMock.inventoryClosureDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: detailBId },
          data:  expect.objectContaining({
            physicalQuantity: 4,
            difference:       -1,  // 4 - 5
          }),
        }),
      );
    });

    it("stores the item observation when provided", async () => {
      await service.updateCounts(closureId, validDto(), superadmin, ipAddress);

      expect(transactionMock.inventoryClosureDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: detailBId },
          data:  expect.objectContaining({ observation: "Vencimiento próximo" }),
        }),
      );
    });

    it("stores null observation when not provided", async () => {
      await service.updateCounts(closureId, validDto(), superadmin, ipAddress);

      expect(transactionMock.inventoryClosureDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: detailAId },
          data:  expect.objectContaining({ observation: null }),
        }),
      );
    });

    it("allows physicalQuantity of zero (valid count result)", async () => {
      const dto: UpdateCountsDto = {
        counts: [{ productId: productAId, physicalQuantity: 0 }],
      } as UpdateCountsDto;

      await expect(
        service.updateCounts(closureId, dto, superadmin, ipAddress),
      ).resolves.toBeDefined();

      expect(transactionMock.inventoryClosureDetail.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ physicalQuantity: 0, difference: -7 }),
        }),
      );
    });

    it("accepts a partial update affecting only one of the closure products", async () => {
      const dto: UpdateCountsDto = {
        counts: [{ productId: productAId, physicalQuantity: 10 }],
      } as UpdateCountsDto;

      await expect(
        service.updateCounts(closureId, dto, superadmin, ipAddress),
      ).resolves.toBeDefined();

      expect(transactionMock.inventoryClosureDetail.update).toHaveBeenCalledTimes(1);
    });

    it("re-fetches the closure after updates to build the response", async () => {
      await service.updateCounts(closureId, validDto(), superadmin, ipAddress);

      expect(transactionMock.inventoryClosure.findUnique).toHaveBeenCalledTimes(2);
    });

    it("records an audit log with action UPDATE and entity INVENTORY_CLOSURE", async () => {
      await service.updateCounts(closureId, validDto(), superadmin, ipAddress);

      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action:    "UPDATE",
          entity:    "INVENTORY_CLOSURE",
          entityId:  closureId,
          newData:   { countsUpdated: 2 },
          ipAddress,
        }),
        transactionMock,
      );
    });

    it("returns the updated closure shape with items from the re-fetched record", async () => {
      const result = (await service.updateCounts(
        closureId,
        validDto(),
        superadmin,
        ipAddress,
      )) as any;

      expect(result).toMatchObject({
        id:        closureId,
        branchId,
        status:    "PENDING",
        confirmed: false,
        locked:    false,
        items: [
          expect.objectContaining({
            productId:        productAId,
            productName:      "Proteína",
            referenceCode:    "P-001",
            unit:             "kg",
            physicalQuantity: 8,
            observation:      null,
          }),
          expect.objectContaining({
            productId:        productBId,
            productName:      "Creatina",
            referenceCode:    "P-002",
            unit:             "g",
            physicalQuantity: 4,
            observation:      "Vencimiento próximo",
          }),
        ],
      });
    });
  });

  describe("DTO validation", () => {
    it("rejects an empty counts array", async () => {
      await expect(
        validateBody({ counts: [] }),
      ).rejects.toThrow();
    });

    it("rejects when productId is not a UUID", async () => {
      await expect(
        validateBody({
          counts: [{ productId: "not-a-uuid", physicalQuantity: 5 }],
        }),
      ).rejects.toThrow();
    });

    it("rejects when physicalQuantity is negative", async () => {
      await expect(
        validateBody({
          counts: [{ productId: productAId, physicalQuantity: -1 }],
        }),
      ).rejects.toThrow();
    });

    it("accepts physicalQuantity of zero", async () => {
      await expect(
        validateBody({
          counts: [{ productId: productAId, physicalQuantity: 0 }],
        }),
      ).resolves.toBeDefined();
    });

    it("rejects when counts is missing entirely", async () => {
      await expect(validateBody({})).rejects.toThrow();
    });

    it("rejects unknown top-level fields", async () => {
      await expect(
        validateBody({
          counts: [{ productId: productAId, physicalQuantity: 5 }],
          extra: "value",
        }),
      ).rejects.toThrow();
    });
  });
});
