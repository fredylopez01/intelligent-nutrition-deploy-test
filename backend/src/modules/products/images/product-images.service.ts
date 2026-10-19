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
import { AuditService } from "../../audit/audit.service.js";
import { PatchImageDto } from "./dto/patch-image.dto.js";
import { positiveIntFromEnv } from "../../../common/utils/env.util.js";

const MAX_IMAGES_PER_PRODUCT = positiveIntFromEnv(
  process.env.PRODUCT_IMAGE_LIMIT,
  5,
);
const UPLOAD_URL_EXPIRES_IN = positiveIntFromEnv(
  process.env.STORAGE_UPLOAD_URL_EXPIRES_IN,
  300,
);

@Injectable()
export class ProductImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
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
      publicUrl: this.storage.buildPublicUrl(storageKey),
      expiresIn: UPLOAD_URL_EXPIRES_IN,
    };
  }

  async confirmImage(
    productId: string,
    dto: ConfirmImageDto,
    userId: string,
    ipAddress?: string,
  ) {
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

      const created = await tx.productImage.create({
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

      await this.auditService.createAuditLog(
        {
          userId,
          action: "CREATE",
          entity: "PRODUCT_IMAGE",
          entityId: created.id,
          newData: {
            productId,
            storageKey: created.storageKey,
            url: created.url,
            fileName: created.fileName,
            mimeType: created.mimeType,
            sizeBytes: Number(created.sizeBytes),
            isPrimary: created.isPrimary,
            sortOrder: created.sortOrder,
          },
          reason: `Creación de imagen ${created.fileName} para el producto ${productId}`,
          ipAddress,
        },
        tx,
      );

      return created;
    });
  }

  async listImages(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");

    const images = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        url: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        isPrimary: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    return images;
  }

  async patchImage(
    productId: string,
    imageId: string,
    dto: PatchImageDto,
    userId: string,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const image = await tx.productImage.findFirst({
        where: { id: imageId, productId },
      });
      if (!image) throw new NotFoundException("Image not found");

      const allImages = await tx.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: "asc" },
      });

      const oldData = {
        isPrimary: image.isPrimary,
        sortOrder: image.sortOrder,
      };

      if (
        dto.isPrimary === false &&
        image.isPrimary &&
        allImages.length === 1
      ) {
        throw new ConflictException({
          code: "PRIMARY_IMAGE_REQUIRED",
          message: "Product must have at least one primary image",
        });
      }

      if (dto.sortOrder !== undefined && dto.sortOrder !== image.sortOrder) {
        const others = allImages.filter((i) => i.id !== imageId);
        const reordered = [
          ...others.slice(0, dto.sortOrder),
          image,
          ...others.slice(dto.sortOrder),
        ];
        for (let i = 0; i < reordered.length; i++) {
          await tx.productImage.update({
            where: { id: reordered[i].id },
            data: { sortOrder: i },
          });
        }
      }

      if (dto.isPrimary === true && !image.isPrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.productImage.update({
          where: { id: imageId },
          data: { isPrimary: true },
        });
      }

      const updated = await tx.productImage.findUniqueOrThrow({
        where: { id: imageId },
      });

      const newData = {
        isPrimary: updated.isPrimary,
        sortOrder: updated.sortOrder,
      };

      const hasChange =
        oldData.isPrimary !== newData.isPrimary ||
        oldData.sortOrder !== newData.sortOrder;

      if (hasChange) {
        await this.auditService.createAuditLog(
          {
            userId,
            action: "UPDATE",
            entity: "PRODUCT_IMAGE",
            entityId: imageId,
            oldData: { ...oldData, productId },
            newData: { ...newData, productId },
            reason: `Actualización de imagen ${updated.fileName} del producto ${productId}`,
            ipAddress,
          },
          tx,
        );
      }

      return updated;
    });
  }

  async deleteImage(
    productId: string,
    imageId: string,
    userId: string,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const image = await tx.productImage.findFirst({
        where: { id: imageId, productId },
      });
      if (!image) throw new NotFoundException("Image not found");

      await this.storage.deleteObject(image.storageKey);
      await tx.productImage.delete({ where: { id: imageId } });

      const remaining = await tx.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: "asc" },
      });

      if (image.isPrimary && remaining.length > 0) {
        await tx.productImage.update({
          where: { id: remaining[0].id },
          data: { isPrimary: true },
        });
      }

      for (let i = 0; i < remaining.length; i++) {
        await tx.productImage.update({
          where: { id: remaining[i].id },
          data: { sortOrder: i },
        });
      }

      await this.auditService.createAuditLog(
        {
          userId,
          action: "DELETE",
          entity: "PRODUCT_IMAGE",
          entityId: imageId,
          oldData: {
            productId,
            storageKey: image.storageKey,
            url: image.url,
            fileName: image.fileName,
            mimeType: image.mimeType,
            sizeBytes: Number(image.sizeBytes),
            isPrimary: image.isPrimary,
            sortOrder: image.sortOrder,
          },
          reason: `Eliminación de imagen ${image.fileName} del producto ${productId}`,
          ipAddress,
        },
        tx,
      );

      return { deleted: true };
    });
  }
}
