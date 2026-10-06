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
import { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import { ListSuppliersQueryDto } from "./dto/list-suppliers-query.dto.js";
import { UpdateSupplierDto } from "./dto/update-supplier.dto.js";
import { SuppliersService } from "./suppliers.service.js";

@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "DEV")
  findAll(@Query() query: ListSuppliersQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(":supplierId")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "DEV")
  findOne(@Param("supplierId", new ParseUUIDPipe()) supplierId: string) {
    return this.suppliersService.findOne(supplierId);
  }

  @Patch(":supplierId")
  @Roles("SUPERADMIN", "BRANCH_LEADER", "DEV")
  update(
    @Param("supplierId", new ParseUUIDPipe()) supplierId: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.suppliersService.update(
      supplierId,
      updateSupplierDto,
      currentUser,
      ipAddress,
    );
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
