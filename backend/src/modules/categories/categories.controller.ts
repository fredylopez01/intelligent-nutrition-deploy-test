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
import { CategoriesService } from "./categories.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CreateCategoryDto } from "./dto/create-category.dto.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { ListCategoriesQueryDto } from "./dto/list-categories-query.dto.js";
import { UpdateCategoryStatusDto } from "./dto/update-category-status.dto.js";

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

  @Get()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(@Query() query: ListCategoriesQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(":categoryId")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(@Param("categoryId", new ParseUUIDPipe()) categoryId: string) {
    return this.categoriesService.findOne(categoryId);
  }

  @Patch(":categoryId/status")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  updateStatus(
    @Param("categoryId", new ParseUUIDPipe()) categoryId: string,
    @Body() updateCategoryStatusDto: UpdateCategoryStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.categoriesService.updateStatus(
      categoryId,
      updateCategoryStatusDto.active,
      currentUser,
      ipAddress,
    );
  }
}
