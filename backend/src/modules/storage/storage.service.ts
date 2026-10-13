import { Injectable, Logger } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface GenerateUploadUrlParams {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  expiresIn?: number;
}

export interface VerifyObjectResult {
  exists: boolean;
  size?: number;
  contentType?: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY;
    const bucket = process.env.STORAGE_BUCKET;
    const publicUrl = process.env.STORAGE_PUBLIC_URL;

    if (
      !endpoint ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucket ||
      !publicUrl
    ) {
      throw new Error("StorageService: missing required STORAGE_* env vars");
    }

    this.client = new S3Client({
      region: process.env.STORAGE_REGION ?? "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
    });
    this.bucket = bucket;
    this.publicUrl = publicUrl;

    this.logger.log(`StorageService initialized with bucket "${bucket}"`);
  }

  async generateUploadUrl(params: GenerateUploadUrlParams): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.storageKey,
      ContentType: params.mimeType,
      ContentLength: params.sizeBytes,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: params.expiresIn ?? 300,
    });
  }

  // Returns { exists: false } instead of throwing when the object is missing.
  async verifyObject(storageKey: string): Promise<VerifyObjectResult> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      return {
        exists: true,
        size: head.ContentLength,
        contentType: head.ContentType,
      };
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  // Uses HTTP Range to fetch only the first bytes, not the whole object.
  async getMagicBytes(storageKey: string, bytes = 16): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Range: `bytes=0-${bytes - 1}`,
      }),
    );

    if (!res.Body) {
      throw new Error(`Could not read object ${storageKey}`);
    }

    const byteArray = await res.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }

  buildPublicUrl(storageKey: string): string {
    return `${this.publicUrl}/${storageKey}`;
  }
}
