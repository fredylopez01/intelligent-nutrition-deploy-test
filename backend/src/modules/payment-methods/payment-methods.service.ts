import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";
import { CreatePaymentMethodDto } from "./dto/create-payment-method.dto.js";
import { ListPaymentMethodsQueryDto } from "./dto/list-payment-methods-query.dto.js";
import { UpdatePaymentMethodDto } from "./dto/update-payment-method.dto.js";

const paymentMethodSelect = {
  id: true,
  code: true,
  name: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

function paymentMethodCodeAlreadyExists() {
  return new ConflictException({
    code: "PAYMENT_METHOD_CODE_ALREADY_EXISTS",
    message: "A payment method with this code already exists.",
    details: {},
  });
}

function paymentMethodNameAlreadyExists() {
  return new ConflictException({
    code: "PAYMENT_METHOD_NAME_ALREADY_EXISTS",
    message: "A payment method with this name already exists.",
    details: {},
  });
}

function paymentMethodNotFound() {
  return new NotFoundException({
    code: "PAYMENT_METHOD_NOT_FOUND",
    message: "Payment method not found.",
    details: {},
  });
}

function paymentMethodAlreadyInState() {
  return new ConflictException({
    code: "ALREADY_IN_STATE",
    message: "Payment method is already in the requested state.",
    details: {},
  });
}

function isPrismaErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaErrorWithCode(error, "P2002");
}

function isRecordNotFoundError(error: unknown): boolean {
  return isPrismaErrorWithCode(error, "P2025");
}

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: ListPaymentMethodsQueryDto) {
    const { page, limit, active, search } = query;
    const where = {
      ...(active === undefined ? {} : { active }),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [total, paymentMethods] = await this.prisma.$transaction([
      this.prisma.paymentMethod.count({ where }),
      this.prisma.paymentMethod.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ name: "asc" }, { code: "asc" }],
        select: paymentMethodSelect,
      }),
    ]);

    return {
      data: paymentMethods,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async create(
    createPaymentMethodDto: CreatePaymentMethodDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { code, name } = createPaymentMethodDto;
    const existingPaymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existingPaymentMethod) {
      throw paymentMethodCodeAlreadyExists();
    }

    const paymentMethodWithSameName = await this.prisma.paymentMethod.findFirst(
      {
        where: { name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      },
    );

    if (paymentMethodWithSameName) {
      throw paymentMethodNameAlreadyExists();
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const paymentMethod = await transaction.paymentMethod.create({
          data: { code, name },
          select: paymentMethodSelect,
        });

        await this.auditService.createAuditLog(
          {
            userId: currentUser.id,
            action: "CREATE",
            entity: "PAYMENT_METHOD",
            entityId: paymentMethod.id,
            newData: paymentMethod,
            reason: `Creación del método de pago ${paymentMethod.name}`,
            ipAddress,
          },
          transaction,
        );

        return paymentMethod;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw paymentMethodCodeAlreadyExists();
      }

      throw error;
    }
  }

  async update(
    paymentMethodId: string,
    updatePaymentMethodDto: UpdatePaymentMethodDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { code, name } = updatePaymentMethodDto;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingPaymentMethod =
          await transaction.paymentMethod.findUnique({
            where: { id: paymentMethodId },
            select: paymentMethodSelect,
          });

        if (!existingPaymentMethod) {
          throw paymentMethodNotFound();
        }

        const changes: { code?: string; name?: string } = {};

        if (code !== undefined && code !== existingPaymentMethod.code) {
          const paymentMethodWithSameCode =
            await transaction.paymentMethod.findUnique({
              where: { code },
              select: { id: true },
            });

          if (paymentMethodWithSameCode) {
            throw paymentMethodCodeAlreadyExists();
          }

          changes.code = code;
        }

        if (name !== undefined && name !== existingPaymentMethod.name) {
          const paymentMethodWithSameName =
            await transaction.paymentMethod.findFirst({
              where: {
                id: { not: paymentMethodId },
                name: { equals: name, mode: "insensitive" },
              },
              select: { id: true },
            });

          if (paymentMethodWithSameName) {
            throw paymentMethodNameAlreadyExists();
          }

          changes.name = name;
        }

        if (changes.code === undefined && changes.name === undefined) {
          return existingPaymentMethod;
        }

        const updatedPaymentMethod = await transaction.paymentMethod.update({
          where: { id: paymentMethodId },
          data: changes,
          select: paymentMethodSelect,
        });

        const oldData: { code?: string; name?: string } = {};
        const newData: { code?: string; name?: string } = {};

        if (changes.code !== undefined) {
          oldData.code = existingPaymentMethod.code;
          newData.code = updatedPaymentMethod.code;
        }

        if (changes.name !== undefined) {
          oldData.name = existingPaymentMethod.name;
          newData.name = updatedPaymentMethod.name;
        }

        await this.auditService.createAuditLog(
          {
            userId: currentUser.id,
            action: "UPDATE",
            entity: "PAYMENT_METHOD",
            entityId: paymentMethodId,
            oldData,
            newData,
            reason: `Actualización del método de pago ${updatedPaymentMethod.name}`,
            ipAddress,
          },
          transaction,
        );

        return updatedPaymentMethod;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw paymentMethodCodeAlreadyExists();
      }

      throw error;
    }
  }

  async updateStatus(
    paymentMethodId: string,
    active: boolean,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingPaymentMethod =
          await transaction.paymentMethod.findUnique({
            where: { id: paymentMethodId },
            select: { name: true, active: true },
          });

        if (!existingPaymentMethod) {
          throw paymentMethodNotFound();
        }

        if (existingPaymentMethod.active === active) {
          throw paymentMethodAlreadyInState();
        }

        await transaction.paymentMethod.update({
          where: { id: paymentMethodId, active: existingPaymentMethod.active },
          data: { active },
        });

        await this.auditService.createAuditLog(
          {
            userId: currentUser.id,
            action: active ? "ACTIVATE" : "DEACTIVATE",
            entity: "PAYMENT_METHOD",
            entityId: paymentMethodId,
            oldData: { active: existingPaymentMethod.active },
            newData: { active },
            reason: `${active ? "Activación" : "Desactivación"} del método de pago ${existingPaymentMethod.name}`,
            ipAddress,
          },
          transaction,
        );

        return { message: "Payment method status updated successfully." };
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw paymentMethodAlreadyInState();
      }

      throw error;
    }
  }
}
