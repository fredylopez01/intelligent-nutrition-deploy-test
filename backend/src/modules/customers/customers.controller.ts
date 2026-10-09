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
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateCustomerDto } from "./dto/create-customer.dto.js";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto.js";
import { CustomersService } from "./customers.service.js";
import { UpdateCustomerStatusDto } from "./dto/update-customer-status.dto.js";

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

  @Patch(":customerId/status")
  @Roles("SUPERADMIN")
  updateStatus(
    @Param("customerId", new ParseUUIDPipe()) customerId: string,
    @Body() updateCustomerStatusDto: UpdateCustomerStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.customersService.updateStatus(
      customerId,
      updateCustomerStatusDto.active,
      currentUser,
      ipAddress,
    );
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
