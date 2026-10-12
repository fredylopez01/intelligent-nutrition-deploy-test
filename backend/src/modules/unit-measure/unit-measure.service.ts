import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { CreateUnitMeasureDto } from "./dto/create-unit-measure.dto.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

@Injectable()
export class UnitMeasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    createUnitMeasureDto: CreateUnitMeasureDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { name, abreviation } = createUnitMeasureDto;

    const existingUnitMeasure = await this.prisma.unitMeasure.findFirst({
      where: {
        OR: [{ name }, { abreviation }],
      },
    });

    if (existingUnitMeasure) {
      if (existingUnitMeasure.name === name) {
        throw new ConflictException({
          code: "UNIT_NAME_ALREADY_EXISTS",
          message: "Unit Measure with this name already exists",
        });
      } else {
        throw new ConflictException({
          code: "UNIT_ABBREVIATION_ALREADY_EXISTS",
          message: "Unit Measure with this abreviation already exists",
        });
      }
    }

    return this.prisma.$transaction(async (transaction) => {
      const unitMeasure = await transaction.unitMeasure.create({
        data: {
          name,
          abreviation,
        },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "UNIT_MEASURE",
          entityId: unitMeasure.id,
          newData: unitMeasure,
          reason: `Creación de la unidad de medida ${unitMeasure.name}`,
          ipAddress,
        },
        transaction,
      );

      return unitMeasure;
    });
  }
}
