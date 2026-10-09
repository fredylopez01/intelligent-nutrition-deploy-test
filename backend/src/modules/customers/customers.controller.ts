import { Body, Controller, Ip, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateCustomerDto } from "./dto/create-customer.dto.js";
import { CustomersService } from "./customers.service.js";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

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