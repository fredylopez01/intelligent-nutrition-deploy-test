import { Controller, Get, Query } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto.js";
import { AuditService } from "./audit.service.js";
import { PreserveApiEnvelope } from "../../common/decorators/preserve-api-envelope.decorator.js";

@Controller("audit-logs")
@Roles("SUPERADMIN", "DEV")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @PreserveApiEnvelope()
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.findAll(query);
  }
}
