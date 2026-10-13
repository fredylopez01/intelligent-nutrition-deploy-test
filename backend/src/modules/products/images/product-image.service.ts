import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
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
}
