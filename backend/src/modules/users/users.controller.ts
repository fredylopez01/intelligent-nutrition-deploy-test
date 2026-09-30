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
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto.js";
import { AssignUserBranchDto } from "./dto/assign-user-branch.dto.js";
import { UpdateUserBranchDto } from "./dto/update-user-branch.dto.js";

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

  @Get(":id")
  @Roles("SUPERADMIN", "DEV")
  findOne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.usersService.findUserById(id);
  }

  @Get(":id/branches")
  @Roles("SUPERADMIN", "DEV")
  getBranches(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.usersService.getBranches(id);
  }

  @Post(":id/branches")
  @Roles("SUPERADMIN", "DEV")
  assignBranch(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() assignUserBranchDto: AssignUserBranchDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.usersService.assignBranch(
      id,
      assignUserBranchDto.branchId,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":id/branches/:branchId")
  @Roles("SUPERADMIN", "DEV")
  deactivateBranch(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @Body() updateUserBranchDto: UpdateUserBranchDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.usersService.deactivateBranch(
      id,
      branchId,
      updateUserBranchDto.active,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":id/status")
  @Roles("SUPERADMIN", "DEV")
  updateStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() updateUserStatusDto: UpdateUserStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.usersService.updateStatus(
      id,
      updateUserStatusDto.active,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":id")
  @Roles("SUPERADMIN", "DEV")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.usersService.update(id, updateUserDto, currentUser, ipAddress);
  }
}
