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
import { randomUUID } from "node:crypto";
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
  publicUrl: string;
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
  buildPublicUrl: jest.fn<(storageKey: string) => string>(),
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
    storageMock.buildPublicUrl.mockImplementation(
      (storageKey) => `https://cdn.example.test/${storageKey}`,
    );
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
      expect(result.publicUrl).toBe(
        `https://cdn.example.test/${result.storageKey}`,
      );
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

  describe("GET /products/:productId/images", () => {
    it("returns an empty array when the product has no images", async () => {
      const product = await createProduct();

      const response = await request(app.getHttpServer())
        .get(endpointPath(product.id))
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .expect(200);

      expect((response.body as { data: unknown[] }).data).toEqual([]);
    });

    it("returns images sorted primary first then by sortOrder ascending", async () => {
      const product = await createProduct();
      const third = await createImage(product.id, {
        isPrimary: false,
        sortOrder: 2,
      });
      const first = await createImage(product.id, {
        isPrimary: false,
        sortOrder: 0,
      });
      const primary = await createImage(product.id, {
        isPrimary: true,
        sortOrder: 1,
      });

      const response = await request(app.getHttpServer())
        .get(endpointPath(product.id))
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .expect(200);

      const images = (
        response.body as { data: { id: string; isPrimary: boolean }[] }
      ).data;
      expect(images).toHaveLength(3);
      expect(images[0].id).toBe(primary.id);
      expect(images[0].isPrimary).toBe(true);
      expect(images[1].id).toBe(first.id);
      expect(images[2].id).toBe(third.id);
    });

    it("includes expected fields and excludes storageKey and createdBy", async () => {
      const product = await createProduct();
      await createImage(product.id, { isPrimary: true, sortOrder: 0 });

      const response = await request(app.getHttpServer())
        .get(endpointPath(product.id))
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .expect(200);

      const images = (
        response.body as { data: Record<string, unknown>[] }
      ).data;
      expect(images).toHaveLength(1);
      expect(images[0]).toMatchObject({
        id: expect.any(String),
        url: expect.any(String),
        fileName: expect.any(String),
        mimeType: "image/png",
        isPrimary: true,
        sortOrder: 0,
        createdAt: expect.any(String),
      });
      expect(images[0]).not.toHaveProperty("storageKey");
      expect(images[0]).not.toHaveProperty("productId");
      expect(images[0]).not.toHaveProperty("createdBy");
    });

    it("returns 404 when the product does not exist", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/products/${randomUUID()}/images`)
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .expect(404);
    });

    it("allows BRANCH_ASSISTANT to list images", async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .get(endpointPath(product.id))
        .set("Authorization", `Bearer ${tokens.BRANCH_ASSISTANT}`)
        .expect(200);
    });

    it("returns 401 without a token", async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .get(endpointPath(product.id))
        .expect(401);
    });
  });

  describe("product list and detail image responses", () => {
    it("sets primaryImageUrl to the primary image URL in the product list", async () => {
      const product = await createProduct();
      await createImage(product.id, { isPrimary: true, sortOrder: 0 });

      const response = await request(app.getHttpServer())
        .get("/api/v1/products")
        .query({ search: product.referenceCode })
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .expect(200);

      const page = response.body as {
        data: { id: string; primaryImageUrl: string | null }[];
      };
      const found = page.data.find((p) => p.id === product.id);
      expect(found).toBeDefined();
      expect(found!.primaryImageUrl).not.toBeNull();
      expect(typeof found!.primaryImageUrl).toBe("string");
    });

    it("includes an images array in the product detail sorted primary first", async () => {
      const product = await createProduct();
      const secondary = await createImage(product.id, {
        isPrimary: false,
        sortOrder: 1,
      });
      const primary = await createImage(product.id, {
        isPrimary: true,
        sortOrder: 0,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}`)
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .expect(200);

      // findOne returns { data: {...} }; the global interceptor wraps it again → body.data.data
      const detail = (
        response.body as {
          data: {
            data: {
              images: { id: string; isPrimary: boolean; sortOrder: number }[];
            };
          };
        }
      ).data.data;
      expect(detail.images).toHaveLength(2);
      expect(detail.images[0].id).toBe(primary.id);
      expect(detail.images[0].isPrimary).toBe(true);
      expect(detail.images[1].id).toBe(secondary.id);
      expect(detail.images[1].isPrimary).toBe(false);
      expect(detail.images[0]).not.toHaveProperty("storageKey");
    });

    it("returns an empty images array in the product detail when there are no images", async () => {
      const product = await createProduct();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/products/${product.id}`)
        .set("Authorization", `Bearer ${tokens.SUPERADMIN}`)
        .expect(200);

      const detail = (
        response.body as { data: { data: { images: unknown[] } } }
      ).data.data;
      expect(detail.images).toEqual([]);
    });
  });

  describe("POST /products/:productId/images — additional edge cases", () => {
    it("rejects a storageKey that does not belong to the product → 403 STORAGE_KEY_MISMATCH", async () => {
      const product = await createProduct();
      const otherProduct = await createProduct();
      const payload = confirmPayload(otherProduct.id);

      const response = await requestFor(
        "post",
        endpointPath(product.id),
        tokens.SUPERADMIN,
      )
        .send(payload)
        .expect(403);

      expect(errorCodeOf(response.body)).toBe("STORAGE_KEY_MISMATCH");
    });

    it("rejects a storageKey already registered for another image → 409 STORAGE_KEY_ALREADY_EXISTS", async () => {
      const product = await createProduct();
      const payload = confirmPayload(product.id);
      await requestFor("post", endpointPath(product.id), tokens.SUPERADMIN)
        .send(payload)
        .expect(201);

      const response = await requestFor(
        "post",
        endpointPath(product.id),
        tokens.SUPERADMIN,
      )
        .send({ ...payload, isPrimary: false })
        .expect(409);

      expect(errorCodeOf(response.body)).toBe("STORAGE_KEY_ALREADY_EXISTS");
    });

    it("rejects a file whose magic bytes do not match the declared MIME type → 422 INVALID_FILE_CONTENT", async () => {
      const product = await createProduct();
      // PDF magic bytes instead of PNG
      storageMock.getMagicBytes.mockResolvedValue(
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
      );

      const response = await requestFor(
        "post",
        endpointPath(product.id),
        tokens.SUPERADMIN,
      )
        .send(confirmPayload(product.id, { mimeType: "image/png" }))
        .expect(422);

      expect(errorCodeOf(response.body)).toBe("INVALID_FILE_CONTENT");
      expect(storageMock.deleteObject).toHaveBeenCalled();
      expect(
        await prisma.productImage.count({ where: { productId: product.id } }),
      ).toBe(0);
    });
  });

  describe("PATCH and DELETE — additional edge cases", () => {
    it("returns 409 PRIMARY_IMAGE_REQUIRED when trying to unset the only primary image", async () => {
      const product = await createProduct();
      const image = await createImage(product.id, {
        isPrimary: true,
        sortOrder: 0,
      });

      const response = await requestFor(
        "patch",
        endpointPath(product.id, image.id),
        tokens.SUPERADMIN,
      )
        .send({ isPrimary: false })
        .expect(409);

      expect(errorCodeOf(response.body)).toBe("PRIMARY_IMAGE_REQUIRED");
    });

    it("returns 404 when patching an image that does not belong to the product", async () => {
      const product = await createProduct();
      const otherProduct = await createProduct();
      const image = await createImage(otherProduct.id, {
        isPrimary: true,
        sortOrder: 0,
      });

      await requestFor(
        "patch",
        endpointPath(product.id, image.id),
        tokens.SUPERADMIN,
      )
        .send({ sortOrder: 1 })
        .expect(404);
    });

    it("returns 404 when deleting an image that does not belong to the product", async () => {
      const product = await createProduct();
      const otherProduct = await createProduct();
      const image = await createImage(otherProduct.id, {
        isPrimary: true,
        sortOrder: 0,
      });

      await requestFor(
        "delete",
        endpointPath(product.id, image.id),
        tokens.SUPERADMIN,
      ).expect(404);
    });
  });
});
