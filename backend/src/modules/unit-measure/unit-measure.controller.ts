import { Body, Controller, Ip, Post } from "@nestjs/common";
import { UnitMeasureService } from "./unit-measure.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CreateUnitMeasureDto } from "./dto/create-unit-measure.dto.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";

@Controller("unit-measure")
export class UnitMeasureController {
  constructor(private readonly unitMeasureService: UnitMeasureService) {}

  @Post()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER")
  create(
    @Body() createUnitMeasureDto: CreateUnitMeasureDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.unitMeasureService.create(
      createUnitMeasureDto,
      currentUser,
      ipAddress,
    );
  }
}
