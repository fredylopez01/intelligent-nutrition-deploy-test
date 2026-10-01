import { Body, Controller, Ip, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import { SuppliersService } from "./suppliers.service.js";

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "DEV")
  create(
    @Body() createSupplierDto: CreateSupplierDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.suppliersService.create(
      createSupplierDto,
      currentUser,
      ipAddress,
    );
  }
}
