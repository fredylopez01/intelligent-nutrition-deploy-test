import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";
import { CreateBranchDto } from "./dto/create-branch.dto.js";
import { ListBranchesQueryDto } from "./dto/list-branches-query.dto.js";
import { UpdateBranchDto } from "./dto/update-branch.dto.js";

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: ListBranchesQueryDto) {
    const { page, limit, search, active } = query;
    const skip = (page - 1) * limit;
    const where = {
      ...(active === undefined ? {} : { active }),
      ...(search
        ? { name: { contains: search, mode: "insensitive" as const } }
        : {}),
    };

    const [total, branches] = await this.prisma.$transaction([
      this.prisma.branch.count({ where }),
      this.prisma.branch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          active: true,
        },
      }),
    ]);

    return {
      data: branches,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        active: true,
      },
    });

    if (!branch) {
      throw new NotFoundException("Branch not found");
    }

    return branch;
  }

  async update(
    id: string,
    updateBranchDto: UpdateBranchDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    if (Object.values(updateBranchDto).every((value) => value === undefined)) {
      throw new BadRequestException("At least one field must be provided");
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingBranch = await transaction.branch.findUnique({
          where: { id },
        });

        if (!existingBranch) {
          throw new NotFoundException("Branch not found");
        }

        const { name, address, phone } = updateBranchDto;
        if (name !== undefined && name !== existingBranch.name) {
          const branchWithSameName = await transaction.branch.findUnique({
            where: { name },
            select: { id: true },
          });

          if (branchWithSameName) {
            throw new ConflictException("Branch name already exists");
          }
        }

        const updatedBranch = await transaction.branch.update({
          where: { id },
          data: {
            ...(name === undefined ? {} : { name }),
            ...(address === undefined ? {} : { address }),
            ...(phone === undefined ? {} : { phone }),
          },
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            active: true,
          },
        });

        if (existingBranch !== updatedBranch) {
          await this.auditService.createAuditLog(
            {
              userId: currentUser.id,
              action: "UPDATE",
              entity: "BRANCH",
              entityId: id,
              oldData: existingBranch,
              newData: updatedBranch,
              reason: `Actualización de la sede ${updatedBranch.name}`,
              ipAddress,
            },
            transaction,
          );
        }

        return updatedBranch;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Branch name already exists");
      }

      throw error;
    }
  }

  async updateStatus(
    id: string,
    active: boolean,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existingBranch = await transaction.branch.findUnique({
        where: { id },
        select: { id: true, name: true, active: true },
      });

      if (!existingBranch) {
        throw new NotFoundException("Branch not found");
      }

      if (existingBranch.active === active) {
        throw new BadRequestException(
          `Branch is already ${active ? "active" : "inactive"}`,
        );
      }

      const updateResult = await transaction.branch.updateMany({
        where: { id, active: existingBranch.active },
        data: { active },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException("Branch status has already changed");
      }

      const updatedBranch = await transaction.branch.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          active: true,
        },
      });

      if (!updatedBranch) {
        throw new NotFoundException("Branch not found");
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: active ? "ACTIVATE" : "DEACTIVATE",
          entity: "BRANCH",
          entityId: id,
          oldData: { active: existingBranch.active },
          newData: { active },
          reason: `${active ? "Activación" : "Desactivación"} de la sede ${existingBranch.name}`,
          ipAddress,
        },
        transaction,
      );

      return updatedBranch;
    });
  }

  async create(
    createBranchDto: CreateBranchDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { name, address, phone } = createBranchDto;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingBranch = await transaction.branch.findUnique({
          where: { name },
          select: { id: true },
        });

        if (existingBranch) {
          throw new ConflictException("Branch name already exists");
        }

        const branch = await transaction.branch.create({
          data: { name, address, phone },
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            active: true,
          },
        });

        await this.auditService.createAuditLog(
          {
            userId: currentUser.id,
            action: "CREATE",
            entity: "BRANCH",
            entityId: branch.id,
            newData: branch,
            reason: `Creación de la sede ${branch.name}`,
            ipAddress,
          },
          transaction,
        );

        return branch;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Branch name already exists");
      }

      throw error;
    }
  }
}
