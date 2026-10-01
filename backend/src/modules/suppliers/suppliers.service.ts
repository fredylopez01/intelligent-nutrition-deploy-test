import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";
import { CreateSupplierDto } from "./dto/create-supplier.dto.js";
import { ListSuppliersQueryDto } from "./dto/list-suppliers-query.dto.js";
import { UpdateSupplierDto } from "./dto/update-supplier.dto.js";

const supplierSelect = {
  personId: true,
  commercialName: true,
  person: {
    select: {
      id: true,
      documentTypeId: true,
      documentNumber: true,
      firstName: true,
      lastName: true,
      businessName: true,
      email: true,
      phone: true,
      address: true,
    },
  },
};

const supplierListSelect = {
  personId: true,
  commercialName: true,
  person: {
    select: {
      id: true,
      businessName: true,
      documentNumber: true,
      email: true,
      phone: true,
      address: true,
      active: true,
    },
  },
};

function alreadySupplierException() {
  return new ConflictException({
    code: "ALREADY_SUPPLIER",
    message: "This person is already registered as a supplier.",
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
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: ListSuppliersQueryDto) {
    const { page, limit, search, active } = query;
    const skip = (page - 1) * limit;
    const where = {
      ...(active === undefined ? {} : { person: { is: { active } } }),
      ...(search
        ? {
            OR: [
              {
                person: {
                  is: {
                    businessName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
              {
                commercialName: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [total, suppliers] = await this.prisma.$transaction([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ commercialName: "asc" }, { personId: "asc" }],
        select: supplierListSelect,
      }),
    ]);

    return {
      data: suppliers.map(({ personId, person, commercialName }) => ({
        id: personId,
        person,
        commercialName,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { personId: supplierId },
      select: supplierListSelect,
    });

    if (!supplier) {
      throw new NotFoundException("Supplier not found");
    }

    return {
      id: supplier.personId,
      person: supplier.person,
      commercialName: supplier.commercialName,
    };
  }

  async update(
    supplierId: string,
    updateSupplierDto: UpdateSupplierDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { commercialName, phone, address } = updateSupplierDto;
    if (
      commercialName === undefined &&
      phone === undefined &&
      address === undefined
    ) {
      throw new BadRequestException("At least one field must be provided");
    }

    return this.prisma.$transaction(async (transaction) => {
      const existingSupplier = await transaction.supplier.findUnique({
        where: { personId: supplierId },
        select: supplierSelect,
      });

      if (!existingSupplier) {
        throw new NotFoundException("Supplier not found");
      }

      const updatedSupplier =
        commercialName === undefined
          ? existingSupplier
          : await transaction.supplier.update({
              where: { personId: supplierId },
              data: { commercialName },
              select: supplierSelect,
            });

      const updatedPerson =
        phone === undefined && address === undefined
          ? updatedSupplier.person
          : await transaction.person.update({
              where: { id: supplierId },
              data: {
                ...(phone === undefined ? {} : { phone }),
                ...(address === undefined ? {} : { address }),
              },
              select: supplierSelect.person.select,
            });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "UPDATE",
          entity: "SUPPLIER",
          entityId: supplierId,
          oldData: {
            commercialName: existingSupplier.commercialName,
            person: {
              phone: existingSupplier.person.phone,
              address: existingSupplier.person.address,
            },
          },
          newData: {
            commercialName: updatedSupplier.commercialName,
            person: {
              phone: updatedPerson.phone,
              address: updatedPerson.address,
            },
          },
          reason: `Actualización del proveedor ${updatedSupplier.commercialName ?? supplierId}`,
          ipAddress,
        },
        transaction,
      );

      return {
        id: updatedSupplier.personId,
        person: updatedPerson,
        commercialName: updatedSupplier.commercialName,
      };
    });
  }

  async create(
    createSupplierDto: CreateSupplierDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { person: personDto, personId, commercialName } = createSupplierDto;
    if (Boolean(personDto) === Boolean(personId)) {
      throw new BadRequestException(
        "Provide either person or personId, but not both",
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      let person;

      if (personDto) {
        const documentType = await transaction.documentType.findUnique({
          where: { id: personDto.documentTypeId },
          select: { id: true, active: true },
        });
        if (!documentType || !documentType.active) {
          throw new NotFoundException("Active document type not found");
        }

        person = await transaction.person.findUnique({
          where: {
            documentTypeId_documentNumber: {
              documentTypeId: personDto.documentTypeId,
              documentNumber: personDto.documentNumber,
            },
          },
          select: {
            id: true,
            active: true,
            supplier: { select: { personId: true } },
          },
        });

        if (person?.supplier) {
          throw alreadySupplierException();
        }
        if (person && !person.active) {
          throw new NotFoundException("Active person not found");
        }

        if (!person) {
          person = await transaction.person.create({
            data: {
              documentTypeId: personDto.documentTypeId,
              documentNumber: personDto.documentNumber,
              businessName: personDto.businessName,
              email: personDto.email,
              phone: personDto.phone,
              address: personDto.address,
            },
            select: { id: true },
          });
        }
      } else {
        person = await transaction.person.findUnique({
          where: { id: personId },
          select: {
            id: true,
            active: true,
            supplier: { select: { personId: true } },
          },
        });

        if (!person || !person.active) {
          throw new NotFoundException("Active person not found");
        }
        if (person.supplier) {
          throw alreadySupplierException();
        }
      }

      let supplier;
      try {
        supplier = await transaction.supplier.create({
          data: {
            personId: person.id,
            commercialName: commercialName.trim(),
          },
          select: supplierSelect,
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw alreadySupplierException();
        }

        throw error;
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "SUPPLIER",
          entityId: supplier.personId,
          newData: {
            person: supplier.person,
            commercialName: supplier.commercialName,
          },
          reason: `Creación del proveedor ${supplier.commercialName ?? supplier.person.businessName ?? supplier.personId}`,
          ipAddress,
        },
        transaction,
      );

      return {
        id: supplier.personId,
        person: supplier.person,
        commercialName: supplier.commercialName,
      };
    });
  }
}
