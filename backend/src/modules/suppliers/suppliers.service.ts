import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";
import { PersonsService } from "../persons/persons.service.js";
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
      active: true,
      documentType: {
        select: {
          code: true,
          name: true,
        },
      },
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
      documentType: {
        select: {
          code: true,
          name: true,
        },
      },
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
    private readonly personsService: PersonsService,
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
              {
                person: {
                  is: {
                    documentNumber: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
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
    const { commercialName, person: personChanges } = updateSupplierDto;
    if (
      commercialName === undefined &&
      (!personChanges ||
        Object.values(personChanges).every((value) => value === undefined))
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

      const updatedPerson = personChanges
        ? await this.personsService.updateProfile(
            transaction,
            supplierId,
            personChanges,
          )
        : existingSupplier.person;
      const updatedSupplier =
        commercialName === undefined
          ? existingSupplier
          : await transaction.supplier.update({
              where: { personId: supplierId },
              data: { commercialName },
              select: supplierSelect,
            });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "UPDATE",
          entity: "SUPPLIER",
          entityId: supplierId,
          oldData: {
            commercialName: existingSupplier.commercialName,
            person: existingSupplier.person,
          },
          newData: {
            commercialName: updatedSupplier.commercialName,
            person: updatedPerson,
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
        person = await this.personsService.findOrCreateByDocument(
          transaction,
          personDto,
        );
      } else {
        person = await transaction.person.findUnique({
          where: { id: personId },
          select: { id: true, active: true },
        });

        if (!person || !person.active) {
          throw new NotFoundException("Active person not found");
        }
      }

      if (!person.active) {
        throw new NotFoundException("Active person not found");
      }

      const existingSupplier = await transaction.supplier.findUnique({
        where: { personId: person.id },
        select: { personId: true },
      });
      if (existingSupplier) {
        throw alreadySupplierException();
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
