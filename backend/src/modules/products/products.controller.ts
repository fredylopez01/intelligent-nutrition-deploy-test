import { Body, Controller, Ip, Post } from "@nestjs/common";
import { ProductsService } from "./products.service.js";
import { CreateProductDto } from "./dto/create-product.dto.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

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
}
