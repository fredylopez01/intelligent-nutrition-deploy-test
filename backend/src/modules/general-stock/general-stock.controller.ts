import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { RestockGeneralStockDto } from "./dto/restock-general-stock.dto.js";
import { GeneralStockService } from "./general-stock.service.js";

@Controller("general-stock")
export class GeneralStockController {
  constructor(private readonly generalStockService: GeneralStockService) {}

  @Get(":productId")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  findByProduct(@Param("productId", new ParseUUIDPipe()) productId: string) {
    return this.generalStockService.findByProduct(productId);
  }

  @Post(":productId/restock")
  @HttpCode(201)
  @Roles("SUPERADMIN")
  restock(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() dto: RestockGeneralStockDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.generalStockService.restock(
      productId,
      dto,
      currentUser,
      ipAddress,
    );
  }
}
