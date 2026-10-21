import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { CreatePaymentMethodDto } from "./dto/create-payment-method.dto.js";

function paymentMethodCodeAlreadyExists() {
  return new ConflictException({
    code: "PAYMENT_METHOD_CODE_ALREADY_EXISTS",
    message: "A payment method with this code already exists.",
    details: {},
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPaymentMethodDto: CreatePaymentMethodDto) {
    const { code, name } = createPaymentMethodDto;
    const existingPaymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existingPaymentMethod) {
      throw paymentMethodCodeAlreadyExists();
    }

    try {
      return await this.prisma.paymentMethod.create({
        data: { code, name },
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw paymentMethodCodeAlreadyExists();
      }

      throw error;
    }
  }
}
