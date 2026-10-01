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
import { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import { ListSuppliersQueryDto } from "./dto/list-suppliers-query.dto.js";
import { SuppliersService } from "./suppliers.service.js";

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(@Query() query: ListSuppliersQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(":supplierId")
  findOne(@Param("supplierId", new ParseUUIDPipe()) supplierId: string) {
    return this.suppliersService.findOne(supplierId);
  }

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
