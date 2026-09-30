import { Body, Controller, Ip, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CreateBranchDto } from "./dto/create-branch.dto.js";
import { BranchesService } from "./branches.service.js";

@Controller("branches")
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

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
