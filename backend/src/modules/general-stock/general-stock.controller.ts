import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { GeneralStockService } from "./general-stock.service.js";

@Controller("general-stock")
export class GeneralStockController {
  constructor(private readonly generalStockService: GeneralStockService) {}

  @Get(":productId")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  findByProduct(@Param("productId", new ParseUUIDPipe()) productId: string) {
    return this.generalStockService.findByProduct(productId);
  }
}
