import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { CreateUnitMeasureDto } from "./dto/create-unit-measure.dto.js";
import { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { ListUnitMeasureQueryDto } from "./dto/list-unit-measure-query.dto.js";

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

  async findAll(query: ListUnitMeasureQueryDto) {
    const { page, limit, active, search } = query;

    if (search !== undefined && search.length < 2) {
      throw new BadRequestException({
        code: "SEARCH_TOO_SHORT",
        message: "Search must contain at least 2 characters.",
        details: { minLength: 2 },
      });
    }

    const where = {
      ...(active === undefined ? {} : { active }),
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    };

    const skip = (page - 1) * limit;

    const [total, unitsMeasure] = await this.prisma.$transaction([
      this.prisma.unitMeasure.count({ where }),
      this.prisma.unitMeasure.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          abreviation: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      data: unitsMeasure,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(unitMeasureId: string) {
    const unitMeasure = await this.prisma.unitMeasure.findUnique({
      where: { id: unitMeasureId },
    });
    if (!unitMeasure) {
      throw new NotFoundException("Unit measure not found");
    }

    return unitMeasure;
  }
}
