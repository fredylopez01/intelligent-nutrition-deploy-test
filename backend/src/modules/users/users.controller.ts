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
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UsersService } from "./users.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";
import { ChangeUserRoleDto } from "./dto/change-user-role.dto.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles("SUPERADMIN", "DEV")
  create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.usersService.create(createUserDto, currentUser, ipAddress);
  }

  @Get()
  @Roles("SUPERADMIN", "DEV")
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Patch("role/:id")
  @Roles("SUPERADMIN", "DEV")
  changeRole(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() changeUserRoleDto: ChangeUserRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.usersService.changeRole(
      id,
      changeUserRoleDto,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.usersService.update(id, updateUserDto, currentUser, ipAddress);
  }
}
