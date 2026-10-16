import {
  Body,
  Controller,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { InventoryService } from "./inventory.service.js";
import { AssignProductDto } from "./dto/assign-product.dto.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

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
}
