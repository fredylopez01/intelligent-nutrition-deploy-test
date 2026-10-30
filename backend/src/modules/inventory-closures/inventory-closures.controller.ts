import {
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { InventoryClosuresService } from "./inventory-closures.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { BranchScopeGuard } from "../../common/guards/branch-scope.guard.js";

@Controller("branches/:branchId/inventory-closures")
@UseGuards(BranchScopeGuard)
export class InventoryClosuresController {
  constructor(
    private readonly inventoryClosuresService: InventoryClosuresService,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  create(
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryClosuresService.create(branchId, currentUser);
  }
}
