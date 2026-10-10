import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { ListPersonsQueryDto } from "./dto/list-persons-query.dto.js";
import { PersonsService } from "./persons.service.js";

@Controller("persons")
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  @Roles("SUPERADMIN", "BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV")
  findAll(@Query() query: ListPersonsQueryDto) {
    return this.personsService.findAll(query);
  }
}
