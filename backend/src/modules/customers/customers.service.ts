import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { AuditService } from "../audit/audit.service.js";
import {
  PersonsService,
  type PersonIdentityInput,
} from "../persons/persons.service.js";
import { CreateCustomerDto } from "./dto/create-customer.dto.js";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto.js";
import { UpdateCustomerDto } from "./dto/update-customer.dto.js";

const customerSelect = {
  personId: true,
  fullName: true,
  active: true,
  createdAt: true,
  updatedAt: true,
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
      documentType: { select: { code: true, name: true } },
    },
  },
};

const customerListSelect = {
  personId: true,
  fullName: true,
  active: true,
  person: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      businessName: true,
      documentNumber: true,
      email: true,
      phone: true,
      address: true,
      documentType: { select: { code: true, name: true } },
    },
  },
};

function alreadyCustomerException() {
  return new ConflictException({
    code: "ALREADY_CUSTOMER",
    message: "This person is already registered as a customer.",
    details: {},
  });
}

function alreadyInStateException() {
  return new ConflictException({
    code: "ALREADY_IN_STATE",
    message: "Customer is already in the requested state.",
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
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly personsService: PersonsService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: ListCustomersQueryDto) {
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
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" as const } },
              {
                person: {
                  is: {
                    firstName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
              {
                person: {
                  is: {
                    lastName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
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
    const skip = (page - 1) * limit;

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ fullName: "asc" }, { personId: "asc" }],
        select: customerListSelect,
      }),
    ]);

    return {
      data: customers.map(({ personId, fullName, active, person }) => ({
        id: personId,
        fullName,
        active,
        person,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { personId: customerId },
      select: customerSelect,
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return {
      id: customer.personId,
      fullName: customer.fullName,
      active: customer.active,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      person: customer.person,
    };
  }

  async update(
    customerId: string,
    updateCustomerDto: UpdateCustomerDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const personChanges = updateCustomerDto.person;
    if (
      !personChanges ||
      Object.values(personChanges).every((value) => value === undefined)
    ) {
      throw new BadRequestException(
        "At least one person field must be provided",
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const existingCustomer = await transaction.customer.findUnique({
        where: { personId: customerId },
        select: customerSelect,
      });
      if (!existingCustomer) {
        throw new NotFoundException("Customer not found");
      }

      const updatedPerson = await this.personsService.updateCustomerPerson(
        transaction,
        customerId,
        personChanges,
      );

      const fullName =
        updatedPerson.businessName?.trim() ||
        [updatedPerson.firstName, updatedPerson.lastName]
          .map((name) => name?.trim())
          .filter(Boolean)
          .join(" ");
      if (!fullName) {
        throw new BadRequestException(
          "Person must have a businessName or a firstName and lastName",
        );
      }
      if (fullName.length > 200) {
        throw new BadRequestException(
          "Customer full name cannot exceed 200 characters",
        );
      }

      const updatedCustomer = await transaction.customer.update({
        where: { personId: customerId },
        data: { fullName },
        select: {
          personId: true,
          fullName: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "UPDATE",
          entity: "CUSTOMER",
          entityId: customerId,
          oldData: {
            fullName: existingCustomer.fullName,
            person: existingCustomer.person,
          },
          newData: {
            fullName: updatedCustomer.fullName,
            person: updatedPerson,
          },
          reason: `Actualización de datos del cliente ${customerId}`,
          ipAddress,
        },
        transaction,
      );

      return {
        id: updatedCustomer.personId,
        fullName: updatedCustomer.fullName,
        active: updatedCustomer.active,
        createdAt: updatedCustomer.createdAt,
        updatedAt: updatedCustomer.updatedAt,
        person: updatedPerson,
      };
    });
  }

  async updateStatus(
    customerId: string,
    active: boolean,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existingCustomer = await transaction.customer.findUnique({
        where: { personId: customerId },
        select: { personId: true, fullName: true, active: true },
      });

      if (!existingCustomer) {
        throw new NotFoundException("Customer not found");
      }
      if (existingCustomer.active === active) {
        throw alreadyInStateException();
      }

      const updateResult = await transaction.customer.updateMany({
        where: { personId: customerId, active: existingCustomer.active },
        data: { active },
      });
      if (updateResult.count === 0) {
        throw alreadyInStateException();
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: active ? "ACTIVATE" : "DEACTIVATE",
          entity: "CUSTOMER",
          entityId: customerId,
          oldData: { active: existingCustomer.active },
          newData: { active },
          reason: `${active ? "Activación" : "Desactivación"} del cliente ${existingCustomer.fullName}`,
          ipAddress,
        },
        transaction,
      );

      return { message: "Customer status updated successfully." };
    });
  }

  async create(
    createCustomerDto: CreateCustomerDto,
    currentUser: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const { person: personDto, personId } = createCustomerDto;
    if (Boolean(personDto) === Boolean(personId)) {
      throw new BadRequestException(
        "Provide either person or personId, but not both",
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      let person;

      if (personDto) {
        const hasIndividualName =
          Boolean(personDto.firstName) && Boolean(personDto.lastName);
        if (!personDto.businessName && !hasIndividualName) {
          throw new BadRequestException(
            "Provide businessName or both firstName and lastName",
          );
        }
        if (
          (personDto.firstName && !personDto.lastName) ||
          (!personDto.firstName && personDto.lastName)
        ) {
          throw new BadRequestException(
            "firstName and lastName must be provided together",
          );
        }

        const identity: PersonIdentityInput = {
          documentTypeId: personDto.documentTypeId,
          documentNumber: personDto.documentNumber,
          firstName: personDto.firstName,
          lastName: personDto.lastName,
          businessName: personDto.businessName,
          email: personDto.email,
          phone: personDto.phone,
          address: personDto.address,
        };
        person = await this.personsService.findOrCreateByDocument(
          transaction,
          identity,
        );
      } else {
        person = await transaction.person.findUnique({
          where: { id: personId },
          select: {
            id: true,
            active: true,
            firstName: true,
            lastName: true,
            businessName: true,
            documentTypeId: true,
            documentNumber: true,
            email: true,
            phone: true,
            address: true,
            documentType: { select: { code: true, name: true } },
          },
        });
      }

      if (!person || !person.active) {
        throw new NotFoundException("Active person not found");
      }

      const existingCustomer = await transaction.customer.findUnique({
        where: { personId: person.id },
        select: { personId: true },
      });
      if (existingCustomer) {
        throw alreadyCustomerException();
      }

      const fullName =
        person.businessName?.trim() ||
        [person.firstName, person.lastName]
          .map((name) => name?.trim())
          .filter(Boolean)
          .join(" ");
      if (!fullName) {
        throw new BadRequestException(
          "Person must have a businessName or a firstName and lastName",
        );
      }
      if (fullName.length > 200) {
        throw new BadRequestException(
          "Customer full name cannot exceed 200 characters",
        );
      }

      let customer;
      try {
        customer = await transaction.customer.create({
          data: { personId: person.id, fullName, active: true },
          select: customerSelect,
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw alreadyCustomerException();
        }
        throw error;
      }

      await this.auditService.createAuditLog(
        {
          userId: currentUser.id,
          action: "CREATE",
          entity: "CUSTOMER",
          entityId: customer.personId,
          newData: customer,
          reason: `Creación del cliente ${customer.fullName}`,
          ipAddress,
        },
        transaction,
      );

      return {
        id: customer.personId,
        personId: customer.personId,
        fullName: customer.fullName,
        active: customer.active,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        person: customer.person,
      };
    });
  }
}
