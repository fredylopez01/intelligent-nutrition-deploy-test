import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { RolesService } from "./roles.service.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";
import { Roles } from "../../common/decorators/roles.decorator.js";

@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Roles("DEV")
  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Roles("SUPERADMIN", "DEV")
  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Roles("DEV")
  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto);
  }
}
