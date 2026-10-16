import { Controller, Get, Query } from "@nestjs/common";
import { InventoryService } from "./inventory.service.js";
import { AvailabilityQueryDto } from "./dto/availability-query.dto.js";
import { Roles } from "../../common/decorators/roles.decorator.js";

@Controller("inventory")
export class InventoryGlobalController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("availability")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  getAvailability(@Query() query: AvailabilityQueryDto) {
    return this.inventoryService.getAvailability(query.productId);
  }
}
