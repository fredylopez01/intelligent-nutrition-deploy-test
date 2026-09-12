import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRoleDto } from "./dto/create-role.dto";

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
}
