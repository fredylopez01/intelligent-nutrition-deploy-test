import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto.js";
import { AuditService } from "./audit.service.js";

@Controller("audit-logs")
@Roles("SUPERADMIN")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles("SUPERADMIN", "DEV")
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.findAll(query);
  }
}
