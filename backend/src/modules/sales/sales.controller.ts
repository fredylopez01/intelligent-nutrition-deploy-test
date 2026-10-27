import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateSaleDto } from "./dto/create-sale.dto.js";
import { ListSalesQueryDto } from "./dto/list-sales-query.dto.js";
import { SalesService } from "./sales.service.js";
import { ReverseSaleDto } from "./dto/reverse-sale.dto.js";

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

  @Get(":saleId")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(
    @Param("saleId", new ParseUUIDPipe()) saleId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.findOne(saleId, currentUser);
  }

  @Post()
  @Roles("BRANCH_LEADER", "BRANCH_ASSISTANT")
  create(
    @Body() createSaleDto: CreateSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.salesService.create(createSaleDto, currentUser);
  }

  @Post(":saleId/reverse")
  @HttpCode(200)
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  reverse(
    @Param("saleId", new ParseUUIDPipe()) saleId: string,
    @Body() reverseSaleDto: ReverseSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.salesService.reverse(
      saleId,
      reverseSaleDto,
      currentUser,
      ipAddress,
    );
  }
}
