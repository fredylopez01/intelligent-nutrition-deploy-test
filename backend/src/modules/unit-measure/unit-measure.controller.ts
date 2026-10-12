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
import { UnitMeasureService } from "./unit-measure.service.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CreateUnitMeasureDto } from "./dto/create-unit-measure.dto.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { ListUnitMeasureQueryDto } from "./dto/list-unit-measure-query.dto.js";
import { UpdateUnitMeasureDto } from "./dto/update-unit-measure.dto.js";
import { UpdateUnitMeasureStatusDto } from "./dto/update-unit-measure-status.dto.js";

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

  @Get()
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findAll(@Query() query: ListUnitMeasureQueryDto) {
    return this.unitMeasureService.findAll(query);
  }

  @Get(":unitMeasureId")
  @Roles("DEV", "SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT")
  findOne(@Param("unitMeasureId", new ParseUUIDPipe()) unitMeasureId: string) {
    return this.unitMeasureService.findOne(unitMeasureId);
  }

  @Patch(":unitMeasureId")
  @Roles("SUPERADMIN")
  update(
    @Param("unitMeasureId", new ParseUUIDPipe()) unitMeasureId: string,
    @Body() updateUniteMeasureDto: UpdateUnitMeasureDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.unitMeasureService.update(
      unitMeasureId,
      updateUniteMeasureDto,
      currentUser,
      ipAddress,
    );
  }

  @Patch(":unitMeasureId/status")
  @Roles("SUPERADMIN", "BRANCH_LEADER")
  updateStatus(
    @Param("unitMeasureId", new ParseUUIDPipe()) unitMeasureId: string,
    @Body() UpdateUnitMeasureStatusDto: UpdateUnitMeasureStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Ip() ipAddress: string,
  ) {
    return this.unitMeasureService.updateStatus(
      unitMeasureId,
      UpdateUnitMeasureStatusDto.active,
      currentUser,
      ipAddress,
    );
  }
}
