import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRoleDto: CreateRoleDto) {
    const name = createRoleDto.name.trim();

    const existingRole = await this.prisma.role.findUnique({
      where: {
        name,
      },
    });

    if (existingRole) {
      throw new ConflictException("Role already exists");
    }

    return this.prisma.role.create({
      data: {
        name,
        description: createRoleDto.description?.trim(),
      },
    });
  }

  async findAll() {
    return this.prisma.role.findMany({
      orderBy: {
        name: "asc",
      },
    });
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const existingRole = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!existingRole) {
      throw new NotFoundException("Role not found");
    }

    if (updateRoleDto.name) {
      const roleWithSameName = await this.prisma.role.findUnique({
        where: {
          name: updateRoleDto.name.trim(),
        },
      });

      if (roleWithSameName && roleWithSameName.id !== id) {
        throw new ConflictException("Role name is already in use");
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(updateRoleDto.name !== undefined && {
          name: updateRoleDto.name.trim(),
        }),
        ...(updateRoleDto.description !== undefined && {
          description: updateRoleDto.description.trim(),
        }),
      },
    });
  }

  async remove(id: string) {
    const existingRole = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!existingRole) {
      throw new NotFoundException("Role not found");
    }

    const usersWithRole = await this.prisma.userAccount.count({
      where: {
        roleId: id,
      },
    });

    if (usersWithRole > 0) {
      throw new ConflictException(
        "Role cannot be deleted because it is assigned to one or more users",
      );
    }

    await this.prisma.role.delete({
      where: { id },
    });

    return {
      message: "Role deleted successfully",
    };
  }
}
