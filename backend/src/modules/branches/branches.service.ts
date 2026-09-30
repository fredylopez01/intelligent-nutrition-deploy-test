import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";
import { CreateBranchDto } from "./dto/create-branch.dto.js";

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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
