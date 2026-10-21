import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CreatePaymentMethodDto } from "./dto/create-payment-method.dto.js";
import { ListPaymentMethodsQueryDto } from "./dto/list-payment-methods-query.dto.js";
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
  create(@Body() createPaymentMethodDto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(createPaymentMethodDto);
  }
}
