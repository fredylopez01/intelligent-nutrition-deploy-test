import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreatePaymentMethodDto } from "./dto/create-payment-method.dto.js";
import { ListPaymentMethodsQueryDto } from "./dto/list-payment-methods-query.dto.js";
import { UpdatePaymentMethodStatusDto } from "./dto/update-payment-method-status.dto.js";
import { UpdatePaymentMethodDto } from "./dto/update-payment-method.dto.js";
import { PaymentMethodsService } from "./payment-methods.service.js";

@Controller("payment-methods")
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(@Query() query: ListPaymentMethodsQueryDto) {
    return this.paymentMethodsService.findAll(query);
  }

  @Post()
  @Roles("SUPERADMIN")
  create(
    @Body() createPaymentMethodDto: CreatePaymentMethodDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.paymentMethodsService.create(
      createPaymentMethodDto,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":paymentMethodId")
  @Roles("SUPERADMIN")
  update(
    @Param("paymentMethodId", new ParseUUIDPipe()) paymentMethodId: string,
    @Body() updatePaymentMethodDto: UpdatePaymentMethodDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.paymentMethodsService.update(
      paymentMethodId,
      updatePaymentMethodDto,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":paymentMethodId/status")
  @Roles("SUPERADMIN")
  updateStatus(
    @Param("paymentMethodId", new ParseUUIDPipe()) paymentMethodId: string,
    @Body() updatePaymentMethodStatusDto: UpdatePaymentMethodStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.paymentMethodsService.updateStatus(
      paymentMethodId,
      updatePaymentMethodStatusDto.active,
      currentUser,
      ipAddress,
    );
  }
}
