import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { AuditService } from "../../audit/audit.service.js";
import { PrismaService } from "../../../database/prisma/prisma.service.js";
import { GenerateUploadUrlDto } from "./dto/generate-upload-url.dto.js";
import { PatchImageDto } from "./dto/patch-image.dto.js";
import { StorageService } from "../../storage/storage.service.js";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;

const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const firstImageId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const secondImageId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const thirdImageId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const maxFileSize = 5 * 1024 * 1024;

const originalImageLimit = process.env.PRODUCT_IMAGE_LIMIT;
const originalUploadUrlExpiry = process.env.STORAGE_UPLOAD_URL_EXPIRES_IN;
process.env.PRODUCT_IMAGE_LIMIT = "5";
process.env.STORAGE_UPLOAD_URL_EXPIRES_IN = "300";

const transactionMock = {
  $queryRaw: jest.fn<AsyncMock>(),
  product: {
    findUnique: jest.fn<AsyncMock>(),
  },
  productImage: {
    count: jest.fn<AsyncMock>(),
    findUnique: jest.fn<AsyncMock>(),
    findFirst: jest.fn<AsyncMock>(),
    findMany: jest.fn<AsyncMock>(),
    create: jest.fn<AsyncMock>(),
    update: jest.fn<AsyncMock>(),
    updateMany: jest.fn<AsyncMock>(),
    findUniqueOrThrow: jest.fn<AsyncMock>(),
    delete: jest.fn<AsyncMock>(),
  },
};

type TransactionCallback = (client: typeof transactionMock) => Promise<unknown>;

const prismaMock = {
  product: {
    findUnique: jest.fn<AsyncMock>(),
  },
  productImage: {
    count: jest.fn<AsyncMock>(),
  },
  $transaction: jest.fn<(operation: TransactionCallback) => Promise<unknown>>(),
};

const storageMock = {
  generateUploadUrl: jest.fn<AsyncMock>(),
  verifyObject: jest.fn<AsyncMock>(),
  getMagicBytes: jest.fn<AsyncMock>(),
  deleteObject: jest.fn<AsyncMock>(),
  buildPublicUrl: jest.fn<(storageKey: string) => string>(),
};

const auditMock = {
  createAuditLog: jest.fn<AsyncMock>(),
};

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const { ProductImagesService } = await import("./product-images.service.js");

function buildImage(
  overrides: Partial<{
    id: string;
    productId: string;
    storageKey: string;
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes: bigint;
    isPrimary: boolean;
    sortOrder: number;
    createdBy: string;
  }> = {},
) {
  return {
    id: firstImageId,
    productId,
    storageKey: `products/${productId}/image.png`,
    url: "https://cdn.example.test/image.png",
    fileName: "image.png",
    mimeType: "image/png",
    sizeBytes: BigInt(2048),
    isPrimary: true,
    sortOrder: 0,
    createdBy: userId,
    ...overrides,
  };
}

async function validateUploadDto(
  value: Record<string, unknown>,
): Promise<GenerateUploadUrlDto> {
  return (await validationPipe.transform(value, {
    type: "body",
    metatype: GenerateUploadUrlDto,
  })) as GenerateUploadUrlDto;
}

describe("ProductImagesService", () => {
  let service: InstanceType<typeof ProductImagesService>;
  let testingModule: TestingModule;

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((operation) =>
      operation(transactionMock),
    );
    prismaMock.product.findUnique.mockResolvedValue({ id: productId });
    prismaMock.productImage.count.mockResolvedValue(0);
    transactionMock.$queryRaw.mockResolvedValue([]);
    transactionMock.product.findUnique.mockResolvedValue({ id: productId });
    transactionMock.productImage.count.mockResolvedValue(0);
    transactionMock.productImage.findUnique.mockResolvedValue(null);
    storageMock.generateUploadUrl.mockResolvedValue(
      "https://storage.example.test/signed-upload",
    );
    storageMock.verifyObject.mockResolvedValue({ exists: true });
    storageMock.getMagicBytes.mockResolvedValue(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    storageMock.deleteObject.mockResolvedValue(undefined);
    storageMock.buildPublicUrl.mockImplementation(
      (storageKey) => `https://cdn.example.test/${storageKey}`,
    );
    auditMock.createAuditLog.mockResolvedValue({});

    testingModule = await Test.createTestingModule({
      providers: [
        ProductImagesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: storageMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = testingModule.get(ProductImagesService);
  });

  afterEach(async () => {
    await testingModule.close();
  });

  afterAll(() => {
    if (originalImageLimit === undefined) {
      delete process.env.PRODUCT_IMAGE_LIMIT;
    } else {
      process.env.PRODUCT_IMAGE_LIMIT = originalImageLimit;
    }
    if (originalUploadUrlExpiry === undefined) {
      delete process.env.STORAGE_UPLOAD_URL_EXPIRES_IN;
    } else {
      process.env.STORAGE_UPLOAD_URL_EXPIRES_IN = originalUploadUrlExpiry;
    }
  });

  describe("generateUploadUrl", () => {
    it("validates MIME type against the whitelist", async () => {
      await expect(
        validateUploadDto({
          fileName: "document.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMock.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("accepts a file exactly 5 MB and returns its signed upload URL and storage key", async () => {
      const dto = await validateUploadDto({
        fileName: "product-image.png",
        mimeType: "image/png",
        sizeBytes: maxFileSize,
      });

      const result = await service.generateUploadUrl(productId, dto);

      expect(result).toEqual({
        uploadUrl: "https://storage.example.test/signed-upload",
        storageKey: expect.stringMatching(
          new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.png$`),
        ),
        publicUrl: `https://cdn.example.test/${result.storageKey}`,
        expiresIn: 300,
      });
      expect(prismaMock.product.findUnique).toHaveBeenCalledWith({
        where: { id: productId },
        select: { id: true },
      });
      expect(prismaMock.productImage.count).toHaveBeenCalledWith({
        where: { productId },
      });
      expect(storageMock.generateUploadUrl).toHaveBeenCalledWith({
        storageKey: result.storageKey,
        mimeType: "image/png",
        sizeBytes: maxFileSize,
        expiresIn: 300,
      });
    });

    it("rejects files larger than 5 MB", async () => {
      await expect(
        validateUploadDto({
          fileName: "product-image.png",
          mimeType: "image/png",
          sizeBytes: maxFileSize + 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMock.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("rejects upload URLs when the product already has five images", async () => {
      prismaMock.productImage.count.mockResolvedValue(5);
      const dto = await validateUploadDto({
        fileName: "product-image.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      });

      await expect(
        service.generateUploadUrl(productId, dto),
      ).rejects.toMatchObject({
        response: { code: "IMAGE_LIMIT_REACHED" },
      });
      expect(storageMock.generateUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe("confirmImage", () => {
    it("verifies the stored object and persists a primary image inside one transaction", async () => {
      const image = buildImage();
      transactionMock.productImage.create.mockResolvedValue(image);
      const dto = {
        storageKey: image.storageKey,
        url: image.url,
        fileName: image.fileName,
        mimeType: image.mimeType,
        sizeBytes: 2048,
        isPrimary: true,
      };

      const result = await service.confirmImage(productId, dto, userId);

      expect(result).toEqual(image);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(transactionMock.productImage.count).toHaveBeenCalledWith({
        where: { productId },
      });
      expect(storageMock.verifyObject).toHaveBeenCalledWith(image.storageKey);
      expect(storageMock.getMagicBytes).toHaveBeenCalledWith(image.storageKey);
      expect(transactionMock.productImage.updateMany).toHaveBeenCalledWith({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
      expect(transactionMock.productImage.create).toHaveBeenCalledWith({
        data: {
          productId,
          storageKey: image.storageKey,
          url: image.url,
          fileName: image.fileName,
          mimeType: image.mimeType,
          sizeBytes: BigInt(2048),
          isPrimary: true,
          sortOrder: 0,
          createdBy: userId,
        },
      });
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE",
          entity: "PRODUCT_IMAGE",
          entityId: image.id,
        }),
        transactionMock,
      );
      expect(
        transactionMock.productImage.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        transactionMock.productImage.create.mock.invocationCallOrder[0],
      );
    });
  });

  describe("patchImage", () => {
    it("changes the primary image and updates sort order transactionally", async () => {
      const firstImage = buildImage({ id: firstImageId, sortOrder: 0 });
      const secondImage = buildImage({
        id: secondImageId,
        storageKey: `products/${productId}/second.png`,
        isPrimary: false,
        sortOrder: 1,
      });
      const thirdImage = buildImage({
        id: thirdImageId,
        storageKey: `products/${productId}/third.png`,
        isPrimary: false,
        sortOrder: 2,
      });
      transactionMock.productImage.findFirst.mockResolvedValue(secondImage);
      transactionMock.productImage.findMany.mockResolvedValue([
        firstImage,
        secondImage,
        thirdImage,
      ]);
      transactionMock.productImage.findUniqueOrThrow.mockResolvedValue({
        ...secondImage,
        isPrimary: true,
        sortOrder: 0,
      });

      const dto: PatchImageDto = { isPrimary: true, sortOrder: 0 };
      const result = await service.patchImage(
        productId,
        secondImageId,
        dto,
        userId,
      );

      expect(result).toMatchObject({
        id: secondImageId,
        isPrimary: true,
        sortOrder: 0,
      });
      expect(transactionMock.productImage.update).toHaveBeenCalledWith({
        where: { id: secondImageId },
        data: { sortOrder: 0 },
      });
      expect(transactionMock.productImage.update).toHaveBeenCalledWith({
        where: { id: firstImageId },
        data: { sortOrder: 1 },
      });
      expect(transactionMock.productImage.update).toHaveBeenCalledWith({
        where: { id: thirdImageId },
        data: { sortOrder: 2 },
      });
      expect(transactionMock.productImage.updateMany).toHaveBeenCalledWith({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
      expect(transactionMock.productImage.update).toHaveBeenCalledWith({
        where: { id: secondImageId },
        data: { isPrimary: true },
      });
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "UPDATE",
          entity: "PRODUCT_IMAGE",
          entityId: secondImageId,
        }),
        transactionMock,
      );
    });
  });

  describe("deleteImage", () => {
    it("deletes the object and record then promotes the next image when deleting the primary", async () => {
      const primaryImage = buildImage();
      const nextImage = buildImage({
        id: secondImageId,
        storageKey: `products/${productId}/second.png`,
        isPrimary: false,
        sortOrder: 1,
      });
      const lastImage = buildImage({
        id: thirdImageId,
        storageKey: `products/${productId}/third.png`,
        isPrimary: false,
        sortOrder: 2,
      });
      transactionMock.productImage.findFirst.mockResolvedValue(primaryImage);
      transactionMock.productImage.findMany.mockResolvedValue([
        nextImage,
        lastImage,
      ]);
      transactionMock.productImage.delete.mockResolvedValue(primaryImage);

      await expect(
        service.deleteImage(productId, firstImageId, userId),
      ).resolves.toEqual({ deleted: true });

      expect(storageMock.deleteObject).toHaveBeenCalledWith(
        primaryImage.storageKey,
      );
      expect(transactionMock.productImage.delete).toHaveBeenCalledWith({
        where: { id: firstImageId },
      });
      expect(transactionMock.productImage.update).toHaveBeenCalledWith({
        where: { id: secondImageId },
        data: { isPrimary: true },
      });
      expect(transactionMock.productImage.update).toHaveBeenCalledWith({
        where: { id: secondImageId },
        data: { sortOrder: 0 },
      });
      expect(transactionMock.productImage.update).toHaveBeenCalledWith({
        where: { id: thirdImageId },
        data: { sortOrder: 1 },
      });
      expect(auditMock.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DELETE",
          entity: "PRODUCT_IMAGE",
          entityId: firstImageId,
        }),
        transactionMock,
      );
      expect(storageMock.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
        transactionMock.productImage.delete.mock.invocationCallOrder[0],
      );
    });
  });
});
