import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { RolesService } from "./roles.service.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @UseGuards(RolesGuard)
  @Roles("SUPERADMIN", "DEV")
  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @UseGuards(RolesGuard)
  @Roles("SUPERADMIN", "DEV")
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @UseGuards(RolesGuard)
  @Roles("SUPERADMIN", "DEV")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.rolesService.remove(id);
  }
}
