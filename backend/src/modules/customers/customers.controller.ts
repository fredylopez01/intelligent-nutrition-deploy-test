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
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateCustomerDto } from "./dto/create-customer.dto.js";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto.js";
import { CustomersService } from "./customers.service.js";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(@Query() query: ListCustomersQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(":customerId")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(@Param("customerId", new ParseUUIDPipe()) customerId: string) {
    return this.customersService.findOne(customerId);
  }

  @Post()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  create(
    @Body() createCustomerDto: CreateCustomerDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.customersService.create(
      createCustomerDto,
      currentUser,
      ipAddress,
    );
  }
}
