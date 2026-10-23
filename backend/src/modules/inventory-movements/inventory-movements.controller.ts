import { Body, Controller, Ip, Post } from "@nestjs/common";
import { InventoryMovementsService } from "./inventory-movements.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateTransferDto } from "./dto/create-transfer.dto.js";
import { CreateAdjustmentDto } from "./dto/create-adjustment.dto.js";

@Controller("inventory-movements")
export class InventoryMovementsController {
  constructor(private readonly inventoryMovementsService: InventoryMovementsService) {}

  @Post("transfers")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  createTransfer(
    @Body() dto: CreateTransferDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryMovementsService.createTransfer(dto, currentUser, ipAddress);
  }

  @Post("adjustments")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  createAdjustment(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryMovementsService.createAdjustment(dto, currentUser, ipAddress);
  }
}
