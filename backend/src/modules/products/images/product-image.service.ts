import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfirmImageDto } from "./dto/confirm-image.dto.js";
import { matchesMagicBytes } from "../../storage/magic-bytes.util.js";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../../database/prisma/prisma.service.js";
import { StorageService } from "../../storage/storage.service.js";
import { GenerateUploadUrlDto } from "./dto/generate-upload-url.dto.js";

const MAX_IMAGES_PER_PRODUCT = Number(process.env.PRODUCT_IMAGE_LIMIT ?? 5);
const UPLOAD_URL_EXPIRES_IN = Number(
  process.env.STORAGE_UPLOAD_URL_EXPIRES_IN ?? 300,
);

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async generateUploadUrl(productId: string, dto: GenerateUploadUrlDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");

    const imageCount = await this.prisma.productImage.count({
      where: { productId },
    });
    if (imageCount >= MAX_IMAGES_PER_PRODUCT) {
      throw new UnprocessableEntityException({
        code: "IMAGE_LIMIT_REACHED",
        message: `Product already has ${MAX_IMAGES_PER_PRODUCT} images`,
      });
    }

    const extension = dto.mimeType.split("/")[1];
    const storageKey = `products/${productId}/${randomUUID()}.${extension}`;

    const uploadUrl = await this.storage.generateUploadUrl({
      storageKey,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      expiresIn: UPLOAD_URL_EXPIRES_IN,
    });

    return {
      uploadUrl,
      storageKey,
      expiresIn: UPLOAD_URL_EXPIRES_IN,
    };
  }

  async confirmImage(productId: string, dto: ConfirmImageDto, userId: string) {
    if (!dto.storageKey.startsWith(`products/${productId}/`)) {
      throw new ForbiddenException({
        code: "STORAGE_KEY_MISMATCH",
        message: "Storage key does not belong to this product",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product WHERE id = ${productId} FOR UPDATE`;

      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) throw new NotFoundException("Product not found");

      const imageCount = await tx.productImage.count({ where: { productId } });
      if (imageCount >= MAX_IMAGES_PER_PRODUCT) {
        throw new UnprocessableEntityException({
          code: "IMAGE_LIMIT_REACHED",
          message: `Product already has ${MAX_IMAGES_PER_PRODUCT} images`,
        });
      }

      const existing = await tx.productImage.findUnique({
        where: { storageKey: dto.storageKey },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: "STORAGE_KEY_ALREADY_EXISTS",
          message: "Storage key already registered",
        });
      }

      const head = await this.storage.verifyObject(dto.storageKey);
      if (!head.exists) {
        throw new NotFoundException({
          code: "STORAGE_OBJECT_NOT_FOUND",
          message: "Object not found in storage",
        });
      }

      const magicBytes = await this.storage.getMagicBytes(dto.storageKey);
      if (!matchesMagicBytes(magicBytes, dto.mimeType)) {
        await this.storage.deleteObject(dto.storageKey);
        throw new UnprocessableEntityException({
          code: "INVALID_FILE_CONTENT",
          message: "File content does not match declared MIME type",
        });
      }

      if (dto.isPrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.productImage.create({
        data: {
          productId,
          storageKey: dto.storageKey,
          url: dto.url,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          sizeBytes: BigInt(dto.sizeBytes),
          isPrimary: dto.isPrimary ?? false,
          sortOrder: dto.sortOrder ?? imageCount,
          createdBy: userId,
        },
      });
    });
  }
}
