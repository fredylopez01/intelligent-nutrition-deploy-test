import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { PurchasesService } from "./purchases.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreatePurchaseDto } from "./dto/create-purchase.dto.js";
import { ListPurchasesQueryDto } from "./dto/list-purchases-query.dto.js";

@Controller("purchases")
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  create(
    @Body() createPurchaseDto: CreatePurchaseDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.purchasesService.create(
      createPurchaseDto,
      currentUser,
      ipAddress,
    );
  }

  @Get()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  findAll(@Query() query: ListPurchasesQueryDto) {
    return this.purchasesService.findAll(query);
  }

  @Get(":purchaseId")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  findOne(@Param("purchaseId", new ParseUUIDPipe()) purchaseId: string) {
    return this.purchasesService.findOne(purchaseId);
  }
}
