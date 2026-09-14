import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { RolesService } from "./roles.service.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.rolesService.remove(id);
  }
}
