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
import { InventoryService } from "./inventory.service.js";
import { AssignProductDto } from "./dto/assign-product.dto.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { ListBranchInventoryQueryDto } from "./dto/list-branch-inventory-query.dto.js";
import { UpdateMinimumStockDto } from "./dto/update-minimunstock.dto.js";

@Controller("branches/:branchId/inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  assignProduct(
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @Body() assignProductDto: AssignProductDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryService.assignProductToBranch(
      branchId,
      assignProductDto,
      currentUser,
      ipAddress,
    );
  }

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @Query() query: ListBranchInventoryQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryService.findAllByBranch(branchId, query, currentUser);
  }

  @Get(":productId")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryService.findOneByBranchAndProduct(
      branchId,
      productId,
      currentUser,
    );
  }

  @Patch(":productId")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  updateMinimumStock(
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() updateMinimumStockDto: UpdateMinimumStockDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryService.updateMinimumStock(
      branchId,
      productId,
      updateMinimumStockDto,
      currentUser,
      ipAddress,
    );
  }
}
