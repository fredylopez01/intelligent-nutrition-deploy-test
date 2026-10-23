import { Body, Controller, Ip, Param, ParseUUIDPipe, Put } from "@nestjs/common";
import { InventoryClosuresService } from "./inventory-closures.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateCountsDto } from "./dto/update-counts.dto.js";

@Controller("inventory-closures")
export class InventoryClosuresGlobalController {
  constructor(private readonly inventoryClosuresService: InventoryClosuresService) {}

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
}
