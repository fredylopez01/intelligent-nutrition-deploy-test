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
import { UpdateUnitMeasureDto } from "./dto/update-unit-measure.dto.js";

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

  async update(
    unitMeasureId: string,
    updateUnitMeasureDto: UpdateUnitMeasureDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    if (
      Object.values(updateUnitMeasureDto).every((value) => value === undefined)
    ) {
      throw new BadRequestException("At least one field must be provided");
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingUnitMeasure = await transaction.unitMeasure.findUnique({
          where: { id: unitMeasureId },
        });

        if (!existingUnitMeasure) {
          throw new NotFoundException("Unit measure not found");
        }

        const { name, abreviation } = updateUnitMeasureDto;
        if (name !== undefined && name !== existingUnitMeasure.name) {
          const unitMeasureWithSame = await transaction.unitMeasure.findFirst({
            where: {
              OR: [{ name }, { abreviation }],
            },
            select: { id: true, name: true, abreviation: true },
          });

          if (name !== undefined && unitMeasureWithSame?.name === name) {
            throw new ConflictException("Unit measure name already exists");
          } else if (
            abreviation !== undefined &&
            unitMeasureWithSame?.abreviation === abreviation
          ) {
            throw new ConflictException(
              "Unit measure abreviation already exists",
            );
          }
        }

        const updatedUnitMeasure = await transaction.unitMeasure.update({
          where: { id: unitMeasureId },
          data: {
            ...(name === undefined ? {} : { name }),
            ...(abreviation === undefined ? {} : { abreviation }),
          },
          select: {
            id: true,
            name: true,
            abreviation: true,
            active: true,
          },
        });

        if (
          existingUnitMeasure.name !== name &&
          existingUnitMeasure.abreviation !== abreviation
        ) {
          await this.auditService.createAuditLog(
            {
              userId: currentUser.id,
              action: "UPDATE",
              entity: "UNIT_MEASURE",
              entityId: unitMeasureId,
              oldData: existingUnitMeasure,
              newData: updatedUnitMeasure,
              reason: `Actualización de la unidad de medida ${updatedUnitMeasure.name}`,
              ipAddress,
            },
            transaction,
          );
        }

        return updatedUnitMeasure;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Unit measure name already exists");
      }

      throw error;
    }
  }

  async updateStatus(
    unitMeasureId: string,
    active: boolean,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return await this.prisma.$transaction(async (transaction) => {
      const existingUnitMeasure = await this.prisma.unitMeasure.findUnique({
        where: { id: unitMeasureId },
        select: { name: true, abreviation: true, active: true },
      });
      if (!existingUnitMeasure) {
        throw new NotFoundException("Unit measure not found");
      }
      if (existingUnitMeasure.active === active) {
        throw new ConflictException({
          code: "ALREADY_IN_STATE",
          message: "Unit measure is already in the requested state.",
        });
      }

      await transaction.unitMeasure.update({
        where: { id: unitMeasureId, active: existingUnitMeasure.active },
        data: { active },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: active ? "ACTIVATE" : "DEACTIVATE",
          entity: "UNIT_MEASURE",
          entityId: unitMeasureId,
          oldData: { active: existingUnitMeasure.active },
          newData: { active },
          reason: `${active ? "Activación" : "Desactivación"} de la unidad de medida ${existingUnitMeasure.name}`,
          ipAddress,
        },
        transaction,
      );

      return { message: "Unit measure status updated successfully." };
    });
  }
}
