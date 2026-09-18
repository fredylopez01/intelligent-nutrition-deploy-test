import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator.js";
import { PrismaService } from "../database/prisma/prisma.service.js";

@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}