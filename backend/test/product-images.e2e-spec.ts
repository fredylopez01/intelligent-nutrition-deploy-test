import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT";
type ImageOperation = "upload" | "confirm" | "patch" | "delete";

interface ApiResponse<T> {
  data: T;
}

interface UploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

interface ImageResponse {
  id: string;
  productId: string;
  storageKey: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string | number;
  isPrimary: boolean;
  sortOrder: number;
}

const originalImageLimit = process.env.PRODUCT_IMAGE_LIMIT;
process.env.PRODUCT_IMAGE_LIMIT = "5";

const { AppModule } = await import("../src/app.module.js");
const { configureApp } = await import("../src/app.setup.js");
const { PrismaService } =
  await import("../src/database/prisma/prisma.service.js");
const { StorageService } =
  await import("../src/modules/storage/storage.service.js");

const runId = Date.now().toString(36);
const documentCode = `IMG-${runId}`.slice(0, 20);
const maxFileSize = 5 * 1024 * 1024;
const pngMagicBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const errorCodeOf = (body: unknown) =>
  (body as { error: { code: string } }).error.code;

const storageMock = {
  generateUploadUrl: jest.fn<(...args: unknown[]) => Promise<string>>(),
  verifyObject: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  getMagicBytes: jest.fn<(...args: unknown[]) => Promise<Buffer>>(),
  deleteObject: jest.fn<(...args: unknown[]) => Promise<void>>(),
};

const roleNames: RoleName[] = [
  "SUPERADMIN",
  "BRANCH_LEADER",
  "BRANCH_ASSISTANT",
];

describe("Product image endpoints (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: InstanceType<typeof PrismaService>;
  let categoryId: string;
  let unitOfMeasureId: string;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds = {} as Record<RoleName, string>;
  const productIds: string[] = [];

  const nextId = () => `${runId}-${(sequence += 1)}`;

  const createProduct = async () => {
    const product = await prisma.product.create({
      data: {
        name: `Producto de imágenes ${nextId()}`,
        referenceCode: `IMG-${runId}-${sequence}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "1000.00",
      },
    });
    productIds.push(product.id);
    return product;
  };

  const createImage = async (
    productId: string,
    overrides: Partial<{
      isPrimary: boolean;
      sortOrder: number;
      fileName: string;
    }> = {},
  ) => {
    const keyPart = nextId().replace(/[^a-zA-Z0-9-]/g, "");
    return prisma.productImage.create({
      data: {
        productId,
        storageKey: `products/${productId}/${keyPart}.png`,
        url: `https://cdn.example.test/${keyPart}.png`,
        fileName: overrides.fileName ?? `${keyPart}.png`,
        mimeType: "image/png",
        sizeBytes: BigInt(1024),
        isPrimary: overrides.isPrimary ?? false,
        sortOrder: overrides.sortOrder ?? 0,
        createdBy: actorIds.SUPERADMIN,
      },
    });
  };

  const uploadPayload = (overrides: Record<string, unknown> = {}) => ({
    fileName: `product-${nextId()}.png`,
    mimeType: "image/png",
    sizeBytes: 1024,
    ...overrides,
  });

  const confirmPayload = (
    productId: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const keyPart = nextId().replace(/[^a-zA-Z0-9-]/g, "");
    return {
      storageKey: `products/${productId}/${keyPart}.png`,
      url: `https://cdn.example.test/${keyPart}.png`,
      fileName: `${keyPart}.png`,
      mimeType: "image/png",
      sizeBytes: 1024,
      isPrimary: true,
      ...overrides,
    };
  };

  const requestFor = (
    method: "post" | "patch" | "delete",
    path: string,
    token: string,
  ) =>
    request(app.getHttpServer())
      [method](path)
      .set("Authorization", `Bearer ${token}`);

  const endpointPath = (productId: string, imageId?: string) =>
    `/api/v1/products/${productId}/images${imageId ? `/${imageId}` : ""}`;

  const sendOperation = async (
    operation: ImageOperation,
    role: RoleName,
    productId: string,
  ) => {
    if (operation === "upload") {
      return requestFor(
        "post",
        `${endpointPath(productId)}/upload-url`,
        tokens[role],
      ).send(uploadPayload());
    }
    if (operation === "confirm") {
      return requestFor("post", endpointPath(productId), tokens[role]).send(
        confirmPayload(productId),
      );
    }

    const image = await createImage(productId, {
      isPrimary: operation === "delete",
    });
    if (operation === "patch") {
      return requestFor(
        "patch",
        endpointPath(productId, image.id),
        tokens[role],
      ).send({ isPrimary: true, sortOrder: 0 });
    }
    return requestFor(
      "delete",
      endpointPath(productId, image.id),
      tokens[role],
    );
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storageMock)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const jwtService = app.get(JwtService);
    documentTypeId = (
      await prisma.documentType.upsert({
        where: { code: documentCode },
        update: { active: true },
        create: { code: documentCode, name: "Documento e2e imágenes" },
      })
    ).id;

    for (const roleName of roleNames) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: nextId(),
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.product-images.${runId}@e2e.test`,
          phone: "3009998877",
          address: "Carrera 9 # 8-7",
          userAccount: {
            create: {
              roleId: role.id,
              active: true,
              mustChangePassword: false,
            },
          },
        },
      });
      actorIds[roleName] = person.id;
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const category = await prisma.category.create({
      data: { name: `Imágenes ${runId}` },
    });
    categoryId = category.id;
    const unit = await prisma.unitMeasure.create({
      data: {
        name: `Img${runId}`.slice(0, 50),
        abreviation: `I${runId}`.slice(0, 10),
      },
    });
    unitOfMeasureId = unit.id;
  }, 30000);

  beforeEach(() => {
    storageMock.generateUploadUrl.mockReset();
    storageMock.verifyObject.mockReset();
    storageMock.getMagicBytes.mockReset();
    storageMock.deleteObject.mockReset();
    storageMock.generateUploadUrl.mockResolvedValue(
      "https://storage.example.test/signed-upload",
    );
    storageMock.verifyObject.mockResolvedValue({ exists: true });
    storageMock.getMagicBytes.mockResolvedValue(pngMagicBytes);
    storageMock.deleteObject.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    try {
      if (productIds.length > 0) {
        await prisma.productImage.deleteMany({
          where: { productId: { in: productIds } },
        });
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { userId: { in: Object.values(actorIds) } },
              { entityId: { in: productIds } },
            ],
          },
        });
        await prisma.product.deleteMany({
          where: { id: { in: productIds } },
        });
      }
      if (categoryId) {
        await prisma.category.deleteMany({ where: { id: categoryId } });
      }
      if (unitOfMeasureId) {
        await prisma.unitMeasure.deleteMany({
          where: { id: unitOfMeasureId },
        });
      }
      const userIds = Object.values(actorIds);
      if (userIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.userAccount.deleteMany({
          where: { personId: { in: userIds } },
        });
        await prisma.person.deleteMany({ where: { id: { in: userIds } } });
      }
      if (documentTypeId) {
        await prisma.documentType.deleteMany({
          where: { id: documentTypeId },
        });
      }
    } finally {
      await app?.close();
      if (originalImageLimit === undefined) {
        delete process.env.PRODUCT_IMAGE_LIMIT;
      } else {
        process.env.PRODUCT_IMAGE_LIMIT = originalImageLimit;
      }
    }
  }, 30000);

  describe("POST /products/:productId/images/upload-url", () => {
    it("returns a signed URL for a valid image", async () => {
      const product = await createProduct();
      const response = await requestFor(
        "post",
        `${endpointPath(product.id)}/upload-url`,
        tokens.SUPERADMIN,
      )
        .send(uploadPayload({ sizeBytes: maxFileSize }))
        .expect(201);
      const result = (response.body as ApiResponse<UploadUrlResponse>).data;

      expect(result).toMatchObject({
        uploadUrl: "https://storage.example.test/signed-upload",
        storageKey: expect.stringMatching(
          new RegExp(`^products/${product.id}/[0-9a-f-]{36}\\.png$`),
        ),
        expiresIn: expect.any(Number),
      });
      expect(storageMock.generateUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          storageKey: result.storageKey,
          mimeType: "image/png",
          sizeBytes: maxFileSize,
        }),
      );
    });

    it("rejects a MIME type outside the whitelist", async () => {
      const product = await createProduct();

      const response = await requestFor(
        "post",
        `${endpointPath(product.id)}/upload-url`,
        tokens.SUPERADMIN,
      )
        .send(uploadPayload({ mimeType: "application/pdf" }))
        .expect(400);

      expect(errorCodeOf(response.body)).toBe("BAD_REQUEST");
      expect(storageMock.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("rejects files larger than 5 MB", async () => {
      const product = await createProduct();

      await requestFor(
        "post",
        `${endpointPath(product.id)}/upload-url`,
        tokens.SUPERADMIN,
      )
        .send(uploadPayload({ sizeBytes: maxFileSize + 1 }))
        .expect(400);

      expect(storageMock.generateUploadUrl).not.toHaveBeenCalled();
    });

    it("rejects a product that already has five images", async () => {
      const product = await createProduct();
      for (let sortOrder = 0; sortOrder < 5; sortOrder += 1) {
        await createImage(product.id, {
          sortOrder,
          isPrimary: sortOrder === 0,
        });
      }

      const response = await requestFor(
        "post",
        `${endpointPath(product.id)}/upload-url`,
        tokens.SUPERADMIN,
      )
        .send(uploadPayload())
        .expect(422);

      expect(errorCodeOf(response.body)).toBe("IMAGE_LIMIT_REACHED");
      expect(storageMock.generateUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe("POST /products/:productId/images", () => {
    it("persists the image after the storage object is verified", async () => {
      const product = await createProduct();
      const payload = confirmPayload(product.id);

      const response = await requestFor(
        "post",
        endpointPath(product.id),
        tokens.SUPERADMIN,
      )
        .send(payload)
        .expect(201);
      const image = (response.body as ApiResponse<ImageResponse>).data;

      expect(storageMock.verifyObject).toHaveBeenCalledWith(payload.storageKey);
      expect(storageMock.getMagicBytes).toHaveBeenCalledWith(
        payload.storageKey,
      );
      expect(image).toMatchObject({
        productId: product.id,
        storageKey: payload.storageKey,
        isPrimary: true,
        sortOrder: 0,
      });
      const persisted = await prisma.productImage.findUniqueOrThrow({
        where: { id: image.id },
      });
      expect(persisted).toMatchObject({
        productId: product.id,
        storageKey: payload.storageKey,
        isPrimary: true,
        sortOrder: 0,
      });
      expect(persisted.sizeBytes).toBe(BigInt(payload.sizeBytes));
    });

    it("fails when the object is missing from storage", async () => {
      const product = await createProduct();
      const payload = confirmPayload(product.id);
      storageMock.verifyObject.mockResolvedValue({ exists: false });

      const response = await requestFor(
        "post",
        endpointPath(product.id),
        tokens.SUPERADMIN,
      )
        .send(payload)
        .expect(404);

      expect(errorCodeOf(response.body)).toBe("STORAGE_OBJECT_NOT_FOUND");
      expect(
        await prisma.productImage.count({
          where: { productId: product.id },
        }),
      ).toBe(0);
      expect(storageMock.getMagicBytes).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /products/:productId/images/:imageId", () => {
    it("updates primary image and sort order in the database", async () => {
      const product = await createProduct();
      const oldPrimary = await createImage(product.id, {
        isPrimary: true,
        sortOrder: 0,
      });
      const target = await createImage(product.id, {
        isPrimary: false,
        sortOrder: 1,
      });

      const response = await requestFor(
        "patch",
        endpointPath(product.id, target.id),
        tokens.SUPERADMIN,
      )
        .send({ isPrimary: true, sortOrder: 0 })
        .expect(200);
      const updated = (response.body as ApiResponse<ImageResponse>).data;

      expect(updated).toMatchObject({
        id: target.id,
        isPrimary: true,
        sortOrder: 0,
      });
      await expect(
        prisma.productImage.findUniqueOrThrow({
          where: { id: oldPrimary.id },
        }),
      ).resolves.toMatchObject({ isPrimary: false, sortOrder: 1 });
      await expect(
        prisma.productImage.findUniqueOrThrow({
          where: { id: target.id },
        }),
      ).resolves.toMatchObject({ isPrimary: true, sortOrder: 0 });
    });
  });

  describe("DELETE /products/:productId/images/:imageId", () => {
    it("deletes the object and database record and promotes a remaining image", async () => {
      const product = await createProduct();
      const primary = await createImage(product.id, {
        isPrimary: true,
        sortOrder: 0,
      });
      const replacement = await createImage(product.id, {
        isPrimary: false,
        sortOrder: 1,
      });

      await requestFor(
        "delete",
        endpointPath(product.id, primary.id),
        tokens.SUPERADMIN,
      ).expect(204);

      expect(storageMock.deleteObject).toHaveBeenCalledWith(primary.storageKey);
      await expect(
        prisma.productImage.findUnique({ where: { id: primary.id } }),
      ).resolves.toBeNull();
      await expect(
        prisma.productImage.findUniqueOrThrow({
          where: { id: replacement.id },
        }),
      ).resolves.toMatchObject({ isPrimary: true, sortOrder: 0 });
    });
  });

  describe("role authorization", () => {
    const operations: ImageOperation[] = [
      "upload",
      "confirm",
      "patch",
      "delete",
    ];

    it.each(
      roleNames
        .filter((role) => role !== "BRANCH_ASSISTANT")
        .flatMap((role) =>
          operations.map((operation) => [role, operation] as const),
        ),
    )("%s can access the %s endpoint", async (role, operation) => {
      const product = await createProduct();

      const response = await sendOperation(operation, role, product.id);

      expect(response.status).toBe(
        operation === "delete"
          ? 204
          : operation === "upload" || operation === "confirm"
            ? 201
            : 200,
      );
    });

    it.each(operations)(
      "denies BRANCH_ASSISTANT access to the %s endpoint",
      async (operation) => {
        const product = await createProduct();

        const response = await sendOperation(
          operation,
          "BRANCH_ASSISTANT",
          product.id,
        );

        expect(response.status).toBe(403);
        expect(errorCodeOf(response.body)).toBe("INSUFFICIENT_PERMISSIONS");
      },
    );
  });
});
