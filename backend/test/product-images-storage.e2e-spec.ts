import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { randomUUID } from "node:crypto";

const getStorageEnv = (testName: string, appName: string) => {
  const value = process.env[testName] ?? process.env[appName];
  if (!value) {
    throw new Error(
      `${testName} or ${appName} is required for storage e2e tests`,
    );
  }
  return value;
};

const endpoint = new URL(
  getStorageEnv("STORAGE_ENDPOINT_TEST", "STORAGE_ENDPOINT"),
);
const bucket = getStorageEnv("STORAGE_BUCKET_TEST", "STORAGE_BUCKET");
const accessKeyId = getStorageEnv(
  "STORAGE_ACCESS_KEY_TEST",
  "STORAGE_ACCESS_KEY",
);
const secretAccessKey = getStorageEnv(
  "STORAGE_SECRET_KEY_TEST",
  "STORAGE_SECRET_KEY",
);
const publicUrl = getStorageEnv(
  "STORAGE_PUBLIC_URL_TEST",
  "STORAGE_PUBLIC_URL",
);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "minio"]);
const isLocalEndpoint =
  endpoint.protocol === "http:" && localHosts.has(endpoint.hostname);

if (!["http:", "https:"].includes(endpoint.protocol)) {
  throw new Error("Storage endpoint must use HTTP or HTTPS");
}
if (!/(^|[-_])(test|e2e|dev)([-_]|$)/i.test(bucket)) {
  throw new Error(
    "Storage test bucket name must identify a test, e2e, or dev environment",
  );
}

process.env.STORAGE_ENDPOINT = endpoint.toString().replace(/\/$/, "");
process.env.STORAGE_BUCKET = bucket;
process.env.STORAGE_ACCESS_KEY = accessKeyId;
process.env.STORAGE_SECRET_KEY = secretAccessKey;
process.env.STORAGE_PUBLIC_URL = publicUrl;
process.env.STORAGE_REGION =
  process.env.STORAGE_REGION_TEST ?? process.env.STORAGE_REGION ?? "auto";
process.env.STORAGE_FORCE_PATH_STYLE =
  process.env.STORAGE_FORCE_PATH_STYLE_TEST ??
  (process.env.STORAGE_ENDPOINT_TEST
    ? String(isLocalEndpoint)
    : (process.env.STORAGE_FORCE_PATH_STYLE ?? String(isLocalEndpoint)));

const { AppModule } = await import("../src/app.module.js");
const { configureApp } = await import("../src/app.setup.js");
const { PrismaService } =
  await import("../src/database/prisma/prisma.service.js");

interface UploadUrlResponse {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  expiresIn: number;
}

interface ApiResponse<T> {
  data: T;
}

const runId = randomUUID();
const documentCode = `IMG-E2E-${runId}`.slice(0, 20);
const imageBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44,
]);

describe("Product image storage and database constraints (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: InstanceType<typeof PrismaService>;
  let categoryId: string;
  let unitOfMeasureId: string;
  let documentTypeId: string;
  let actorId: string;
  let token: string;
  let sequence = 0;
  const productIds: string[] = [];
  const storageKeys: string[] = [];
  const s3 = new S3Client({
    region: process.env.STORAGE_REGION,
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
  });

  const nextId = () => `${runId}-${(sequence += 1)}`;

  const createProduct = async () => {
    const product = await prisma.product.create({
      data: {
        name: `Producto imagen e2e ${nextId()}`,
        referenceCode: `IMG-${runId}-${sequence}`.slice(0, 50),
        categoryId,
        unitOfMeasureId,
        price: "1000.00",
      },
    });
    productIds.push(product.id);
    return product;
  };

  const createImage = (
    productId: string,
    overrides: {
      storageKey?: string;
      isPrimary?: boolean;
      createdBy?: string;
    } = {},
  ) => {
    const key =
      overrides.storageKey ?? `products/${productId}/${randomUUID()}.png`;
    return prisma.productImage.create({
      data: {
        productId,
        storageKey: key,
        url: `${publicUrl}/${key}`,
        fileName: `${nextId()}.png`,
        mimeType: "image/png",
        sizeBytes: BigInt(imageBytes.length),
        isPrimary: overrides.isPrimary ?? false,
        sortOrder: 0,
        createdBy: overrides.createdBy ?? actorId,
      },
    });
  };

  beforeAll(async () => {
    if (isLocalEndpoint) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const knownExistingBucketErrors = new Set([
          "BucketAlreadyExists",
          "BucketAlreadyOwnedByYou",
        ]);
        if (
          !(error instanceof Error) ||
          !knownExistingBucketErrors.has(error.name)
        ) {
          throw error;
        }
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    const role = await prisma.role.upsert({
      where: { name: "SUPERADMIN" },
      update: { active: true },
      create: { name: "SUPERADMIN" },
    });
    const person = await prisma.person.create({
      data: {
        documentTypeId,
        documentNumber: nextId(),
        firstName: "SUPERADMIN",
        lastName: "E2E",
        email: `superadmin.product-image-storage.${runId}@e2e.test`,
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
    actorId = person.id;
    token = await jwtService.signAsync({ sub: person.id });

    const category = await prisma.category.create({
      data: { name: `Imagenes e2e ${runId}` },
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

  afterAll(async () => {
    try {
      if (storageKeys.length > 0) {
        await Promise.all(
          storageKeys.map((Key) =>
            s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })),
          ),
        );
      }
      if (productIds.length > 0) {
        await prisma.productImage.deleteMany({
          where: { productId: { in: productIds } },
        });
        await prisma.auditLog.deleteMany({
          where: {
            OR: [{ userId: actorId }, { entityId: { in: productIds } }],
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
      if (actorId) {
        await prisma.auditLog.deleteMany({ where: { userId: actorId } });
        await prisma.userAccount.deleteMany({
          where: { personId: actorId },
        });
        await prisma.person.deleteMany({ where: { id: actorId } });
      }
      if (documentTypeId) {
        await prisma.documentType.deleteMany({
          where: { id: documentTypeId },
        });
      }
    } finally {
      await app?.close();
      s3.destroy();
    }
  }, 30000);

  it("uploads through a signed URL, checks HeadObject, then deletes through the API", async () => {
    const product = await createProduct();
    const fileName = `product-${nextId()}.png`;
    const uploadResponse = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/images/upload-url`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        fileName,
        mimeType: "image/png",
        sizeBytes: imageBytes.length,
      })
      .expect(201);
    const upload = (uploadResponse.body as ApiResponse<UploadUrlResponse>).data;
    storageKeys.push(upload.storageKey);

    expect(upload.storageKey).toMatch(
      new RegExp(`^products/${product.id}/[0-9a-f-]{36}\\.png$`),
    );
    const signedUploadUrl = new URL(upload.uploadUrl);
    expect(signedUploadUrl.protocol).toBe(endpoint.protocol);
    expect([endpoint.host, `${bucket}.${endpoint.host}`]).toContain(
      signedUploadUrl.host,
    );

    const uploaded = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: imageBytes,
    });
    expect(uploaded.status).toBe(200);

    const storedObject = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: upload.storageKey }),
    );
    expect(storedObject).toMatchObject({
      ContentLength: imageBytes.length,
      ContentType: "image/png",
    });

    const confirmedResponse = await request(app.getHttpServer())
      .post(`/api/v1/products/${product.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        storageKey: upload.storageKey,
        url: upload.publicUrl,
        fileName,
        mimeType: "image/png",
        sizeBytes: imageBytes.length,
        isPrimary: true,
      })
      .expect(201);
    const imageId = (confirmedResponse.body as ApiResponse<{ id: string }>).data
      .id;

    await request(app.getHttpServer())
      .delete(`/api/v1/products/${product.id}/images/${imageId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    await expect(
      s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: upload.storageKey }),
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    await expect(
      prisma.productImage.findUnique({ where: { id: imageId } }),
    ).resolves.toBeNull();
  }, 30000);

  it("enforces uniqueness of product_image.storage_key", async () => {
    const product = await createProduct();
    const image = await createImage(product.id);

    await expect(
      createImage(product.id, { storageKey: image.storageKey }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows only one primary image per product", async () => {
    const product = await createProduct();
    await createImage(product.id, { isPrimary: true });

    await expect(
      createImage(product.id, { isPrimary: true }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces product_image foreign keys for product and creator", async () => {
    const product = await createProduct();
    const missingProductId = randomUUID();
    const missingCreatorId = randomUUID();

    await expect(createImage(missingProductId)).rejects.toMatchObject({
      code: "P2003",
    });
    await expect(
      createImage(product.id, { createdBy: missingCreatorId }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("prevents deleting a product that still has product_image rows", async () => {
    const product = await createProduct();
    await createImage(product.id);

    await expect(
      prisma.product.delete({ where: { id: product.id } }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.product.findUnique({ where: { id: product.id } }),
    ).resolves.not.toBeNull();
  });
});
