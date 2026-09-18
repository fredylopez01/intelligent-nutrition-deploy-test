import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UsersService } from "./users.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { ListUsersQueryDto } from "./dto/list-users-query.dto.js";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles("SUPER ADMIN")
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Roles("SUPER ADMIN")
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }
}
