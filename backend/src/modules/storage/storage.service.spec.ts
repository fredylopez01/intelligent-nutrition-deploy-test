import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const s3Mock = mockClient(S3Client);
const getSignedUrlMock = jest.fn<(...args: unknown[]) => Promise<string>>();

jest.unstable_mockModule("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

const { StorageService } = await import("./storage.service.js");

const storageEnvKeys = [
  "STORAGE_ENDPOINT",
  "STORAGE_ACCESS_KEY",
  "STORAGE_SECRET_KEY",
  "STORAGE_BUCKET",
  "STORAGE_PUBLIC_URL",
  "STORAGE_REGION",
  "STORAGE_FORCE_PATH_STYLE",
] as const;

const originalStorageEnv = Object.fromEntries(
  storageEnvKeys.map((key) => [key, process.env[key]]),
);

describe("StorageService", () => {
  let service: InstanceType<typeof StorageService>;

  beforeEach(() => {
    s3Mock.reset();
    jest.clearAllMocks();
    process.env.STORAGE_ENDPOINT = "https://storage.example.test";
    process.env.STORAGE_ACCESS_KEY = "test-access-key";
    process.env.STORAGE_SECRET_KEY = "test-secret-key";
    process.env.STORAGE_BUCKET = "nutrition-test";
    process.env.STORAGE_PUBLIC_URL = "https://cdn.example.test";

    service = new StorageService();
  });

  afterAll(() => {
    s3Mock.restore();
    for (const key of storageEnvKeys) {
      const originalValue = originalStorageEnv[key];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  });

  it("generates a signed upload URL with the object metadata and expiry", async () => {
    getSignedUrlMock.mockResolvedValue(
      "https://storage.example.test/signed-upload",
    );

    const result = await service.generateUploadUrl({
      storageKey: "products/image.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      expiresIn: 600,
    });

    expect(result).toBe("https://storage.example.test/signed-upload");
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    const [client, command, options] = getSignedUrlMock.mock.calls[0];
    expect(client).toBeInstanceOf(S3Client);
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: "nutrition-test",
      Key: "products/image.png",
      ContentType: "image/png",
      ContentLength: 2048,
    });
    expect(options).toEqual({ expiresIn: 600 });
  });

  it("verifies an existing object and returns its metadata", async () => {
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 2048,
      ContentType: "image/png",
    });

    await expect(service.verifyObject("products/image.png")).resolves.toEqual({
      exists: true,
      size: 2048,
      contentType: "image/png",
    });

    const [call] = s3Mock.commandCalls(HeadObjectCommand);
    expect(call.args[0].input).toEqual({
      Bucket: "nutrition-test",
      Key: "products/image.png",
    });
  });

  it("reports a missing object when HeadObject returns NotFound", async () => {
    const error = new Error("Object not found");
    error.name = "NotFound";
    s3Mock.on(HeadObjectCommand).rejects(error);

    await expect(service.verifyObject("products/missing.png")).resolves.toEqual(
      { exists: false },
    );

    expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(1);
  });

  it("deletes an object from the configured bucket", async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});

    await expect(
      service.deleteObject("products/image.png"),
    ).resolves.toBeUndefined();

    const [call] = s3Mock.commandCalls(DeleteObjectCommand);
    expect(call.args[0].input).toEqual({
      Bucket: "nutrition-test",
      Key: "products/image.png",
    });
  });
});
