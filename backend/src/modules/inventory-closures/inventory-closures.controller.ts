import { Controller, HttpCode, Ip, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { InventoryClosuresService } from "./inventory-closures.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

@Controller("branches/:branchId/inventory-closures")
export class InventoryClosuresController {
  constructor(private readonly inventoryClosuresService: InventoryClosuresService) {}

  @Post()
  @HttpCode(201)
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  create(
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryClosuresService.create(branchId, currentUser, ipAddress);
  }
}
