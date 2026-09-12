import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const email = createUserDto.email.trim().toLowerCase();

    const existingUser = await this.prisma.userAccount.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const role = await this.prisma.role.findUnique({
      where: {
        id: createUserDto.roleId,
      },
    });

    if (!role) {
      throw new NotFoundException("Role not found");
    }

    const passwordHash = await argon2.hash(createUserDto.password);

    const user = await this.prisma.userAccount.create({
      data: {
        fullName: createUserDto.fullName.trim(),
        email,
        passwordHash,
        roleId: createUserDto.roleId,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        roleId: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }
}
