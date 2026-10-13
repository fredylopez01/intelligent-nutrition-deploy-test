import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ProductsService } from "./products.service.js";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { ListProductsQueryDto } from "./dto/list-products-query.dto.js";
import { UpdateProductDto } from "./dto/update-product.dto.js";
import { UpdateProductStatusDto } from "./dto/update-product-status.dto.js";

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.productsService.create(
      createProductDto,
      currentUser,
      ipAddress,
    );
  }

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(":productId")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(@Param("productId", new ParseUUIDPipe()) productId: string) {
    return this.productsService.findOne(productId);
  }

  @Patch(":productId")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  update(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.productsService.update(
      productId,
      updateProductDto,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":productId/status")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  updateStatus(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() updateProductStatusDto: UpdateProductStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.productsService.updateStatus(
      productId,
      updateProductStatusDto.active,
      currentUser,
      ipAddress,
    );
  }
}
