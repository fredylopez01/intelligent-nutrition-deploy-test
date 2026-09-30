import { Body, Controller, Get, Ip, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateBranchDto } from "./dto/create-branch.dto.js";
import { ListBranchesQueryDto } from "./dto/list-branches-query.dto.js";
import { BranchesService } from "./branches.service.js";
import { Public } from "../../common/decorators/public.decorator.js";

@Controller("branches")
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @Public()
  findAll(@Query() query: ListBranchesQueryDto) {
    return this.branchesService.findAll(query);
  }

  @Post()
  @Roles("SUPERADMIN")
  create(
    @Body() createBranchDto: CreateBranchDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.branchesService.create(createBranchDto, currentUser, ipAddress);
  }
}
