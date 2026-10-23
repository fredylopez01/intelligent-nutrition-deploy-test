import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { InventoryClosuresService } from "./inventory-closures.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateCountsDto } from "./dto/update-counts.dto.js";
import { ListClosuresQueryDto } from "./dto/list-closures-query.dto.js";

@Controller("inventory-closures")
export class InventoryClosuresGlobalController {
  constructor(private readonly inventoryClosuresService: InventoryClosuresService) {}

  @Get()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(@Query() query: ListClosuresQueryDto) {
    return this.inventoryClosuresService.findAll(query);
  }

  @Put(":closureId/counts")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  updateCounts(
    @Param("closureId", new ParseUUIDPipe()) closureId: string,
    @Body() dto: UpdateCountsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryClosuresService.updateCounts(closureId, dto, currentUser, ipAddress);
  }

  @Post(":closureId/confirm")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  confirm(
    @Param("closureId", new ParseUUIDPipe()) closureId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryClosuresService.confirm(closureId, currentUser, ipAddress);
  }
}
