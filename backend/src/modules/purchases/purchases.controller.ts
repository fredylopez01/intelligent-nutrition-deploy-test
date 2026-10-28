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
  UseGuards,
} from "@nestjs/common";
import { PurchasesService } from "./purchases.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { BranchScopeGuard } from "../../common/guards/branch-scope.guard.js";
import { CreatePurchaseDto } from "./dto/create-purchase.dto.js";
import { ListPurchasesQueryDto } from "./dto/list-purchases-query.dto.js";
import { ReceivePurchaseDto } from "./dto/receive-purchase.dto.js";

@Controller("purchases")
@UseGuards(BranchScopeGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  @Roles("SUPERADMIN", "BRANCH_LEADER")
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
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  findAll(@Query() query: ListPurchasesQueryDto) {
    return this.purchasesService.findAll(query);
  }

  @Get(":purchaseId")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  findOne(@Param("purchaseId", new ParseUUIDPipe()) purchaseId: string) {
    return this.purchasesService.findOne(purchaseId);
  }

  @Post(":purchaseId/receipts")
  @HttpCode(200)
  @Roles("SUPERADMIN")
  receive(
    @Param("purchaseId", new ParseUUIDPipe()) purchaseId: string,
    @Body() receivePurchaseDto: ReceivePurchaseDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.purchasesService.receive(
      purchaseId,
      receivePurchaseDto,
      currentUser,
      ipAddress,
    );
  }
}
