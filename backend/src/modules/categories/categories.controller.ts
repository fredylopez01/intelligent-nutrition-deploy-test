import { Body, Controller, Ip, Post } from "@nestjs/common";
import { CategoriesService } from "./categories.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.categoriesService.create(
      createCategoryDto,
      currentUser,
      ipAddress,
    );
  }
}
