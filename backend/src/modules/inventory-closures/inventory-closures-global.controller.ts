import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { InventoryClosuresService } from "./inventory-closures.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateCountsDto } from "./dto/update-counts.dto.js";
import { ListClosuresQueryDto } from "./dto/list-closures-query.dto.js";
import { BranchScopeGuard } from "../../common/guards/branch-scope.guard.js";

@Controller("inventory-closures")
@UseGuards(BranchScopeGuard)
export class InventoryClosuresGlobalController {
  constructor(
    private readonly inventoryClosuresService: InventoryClosuresService,
  ) {}

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(
    @Query() query: ListClosuresQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryClosuresService.findAll(query, currentUser);
  }

  @Get(":closureId")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(
    @Param("closureId", new ParseUUIDPipe()) closureId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryClosuresService.findOne(closureId, currentUser);
  }

  @Put(":closureId/counts")
  @Roles("BRANCH_LEADER", "BRANCH_ASSISTANT")
  updateCounts(
    @Param("closureId", new ParseUUIDPipe()) closureId: string,
    @Body() dto: UpdateCountsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryClosuresService.updateCounts(
      closureId,
      dto,
      currentUser,
    );
  }

  @Post(":closureId/confirm")
  @HttpCode(200)
  @Roles("BRANCH_LEADER", "BRANCH_ASSISTANT")
  confirm(
    @Param("closureId", new ParseUUIDPipe()) closureId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.inventoryClosuresService.confirm(
      closureId,
      currentUser,
      ipAddress,
    );
  }
}
