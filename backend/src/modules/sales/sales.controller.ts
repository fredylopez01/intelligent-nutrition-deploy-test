import { Body, Controller, Get, Ip, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateSaleDto } from "./dto/create-sale.dto.js";
import { ListSalesQueryDto } from "./dto/list-sales-query.dto.js";
import { SalesService } from "./sales.service.js";

@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(
    @Query() query: ListSalesQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.findAll(query, currentUser);
  }

  @Post()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  create(
    @Body() createSaleDto: CreateSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.salesService.create(createSaleDto, currentUser, ipAddress);
  }
}
