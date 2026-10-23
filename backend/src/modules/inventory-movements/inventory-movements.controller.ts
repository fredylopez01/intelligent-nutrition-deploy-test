import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { InventoryMovementsService } from "./inventory-movements.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateTransferDto } from "./dto/create-transfer.dto.js";
import { CreateAdjustmentDto } from "./dto/create-adjustment.dto.js";
import { ListInventoryMovementsQueryDto } from "./dto/list-inventory-movements-query.dto.js";
import { CreateMovementDto } from "./dto/create-movement.dto.js";

@Controller("inventory-movements")
export class InventoryMovementsController {
  constructor(private readonly inventoryMovementsService: InventoryMovementsService) {}

  @Post()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  createMovement(
    @Body() dto: CreateMovementDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryMovementsService.createMovement(dto, currentUser, ipAddress);
  }

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

  @Get()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(
    @Query() query: ListInventoryMovementsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryMovementsService.findAll(query, currentUser);
  }

  @Get(":movementId")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(
    @Param("movementId", new ParseUUIDPipe()) movementId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryMovementsService.findOne(movementId, currentUser);
  }
}
