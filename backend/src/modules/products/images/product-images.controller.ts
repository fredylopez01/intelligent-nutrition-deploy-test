import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ProductImagesService } from "./product-images.service.js";
import { GenerateUploadUrlDto } from "./dto/generate-upload-url.dto.js";
import { ConfirmImageDto } from "./dto/confirm-image.dto.js";
import { PatchImageDto } from "./dto/patch-image.dto.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../../common/interfaces/AuthenticatedUser.js";

@Controller("products/:productId/images")
export class ProductImagesController {
  constructor(private readonly productImagesService: ProductImagesService) {}

  @Post("upload-url")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  generateUploadUrl(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() dto: GenerateUploadUrlDto,
  ) {
    return this.productImagesService.generateUploadUrl(productId, dto);
  }

  @Post()
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  confirm(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() dto: ConfirmImageDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.productImagesService.confirmImage(
      productId,
      dto,
      currentUser.id,
      ipAddress,
    );
  }

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  list(@Param("productId", new ParseUUIDPipe()) productId: string) {
    return this.productImagesService.listImages(productId);
  }

  @Patch(":imageId")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  patch(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Param("imageId", new ParseUUIDPipe()) imageId: string,
    @Body() dto: PatchImageDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.productImagesService.patchImage(
      productId,
      imageId,
      dto,
      currentUser.id,
      ipAddress,
    );
  }

  @Delete(":imageId")
  @HttpCode(204)
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  delete(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Param("imageId", new ParseUUIDPipe()) imageId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.productImagesService.deleteImage(
      productId,
      imageId,
      currentUser.id,
      ipAddress,
    );
  }
}
