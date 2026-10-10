import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { CreatePersonDto } from "./dto/create-person.dto.js";
import { ListPersonsQueryDto } from "./dto/list-persons-query.dto.js";
import { UpdatePersonDto } from "./dto/update-person.dto.js";
import { UpdatePersonProfileDto } from "./dto/update-person-profile.dto.js";

type PersonTransaction = Pick<PrismaService, "person" | "documentType">;

export interface PersonIdentityInput {
  documentTypeId: string;
  documentNumber: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  email: string;
  phone: string;
  address: string;
}

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListPersonsQueryDto) {
    const { page, limit, search } = query;
    if (search !== undefined && search.length < 2) {
      throw new BadRequestException({
        code: "SEARCH_TOO_SHORT",
        message: "Search must contain at least 2 characters.",
        details: { minLength: 2 },
      });
    }

    const where = {
      active: true,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              {
                businessName: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                documentNumber: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [total, people] = await this.prisma.$transaction([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { businessName: "asc" },
          { lastName: "asc" },
          { firstName: "asc" },
          { id: "asc" },
        ],
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
          userAccount: { select: { personId: true } },
          customer: { select: { personId: true } },
          supplier: { select: { personId: true } },
        },
      }),
    ]);

    return {
      data: people.map(({ userAccount, customer, supplier, ...person }) => ({
        ...person,
        relationships: {
          hasUserAccount: Boolean(userAccount),
          isCustomer: Boolean(customer),
          isSupplier: Boolean(supplier),
        },
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOrCreateByDocument(
    transaction: PersonTransaction,
    person: PersonIdentityInput,
  ) {
    const hasFirstName = Boolean(person.firstName);
    const hasLastName = Boolean(person.lastName);
    const hasBusinessName = Boolean(person.businessName);

    if (hasFirstName !== hasLastName) {
      throw new BadRequestException(
        "firstName and lastName must be provided together",
      );
    }
    if (!hasBusinessName && !(hasFirstName && hasLastName)) {
      throw new BadRequestException(
        "Provide businessName or both firstName and lastName",
      );
    }

    const documentType = await transaction.documentType.findUnique({
      where: { id: person.documentTypeId },
      select: { id: true, active: true },
    });
    if (!documentType || !documentType.active) {
      throw new NotFoundException("Active document type not found");
    }

    const existingPerson = await transaction.person.findUnique({
      where: {
        documentTypeId_documentNumber: {
          documentTypeId: person.documentTypeId,
          documentNumber: person.documentNumber,
        },
      },
      select: {
        id: true,
        active: true,
        documentTypeId: true,
        documentNumber: true,
        firstName: true,
        lastName: true,
        businessName: true,
        email: true,
        phone: true,
        address: true,
        documentType: { select: { code: true, name: true } },
      },
    });
    if (existingPerson) {
      return existingPerson;
    }

    const existingEmail = await transaction.person.findFirst({
      where: {
        email: { equals: person.email.toLowerCase(), mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existingEmail) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_IN_USE",
        message:
          "This email address is already associated with another person.",
        details: {},
      });
    }

    return transaction.person.create({
      data: {
        documentTypeId: person.documentTypeId,
        documentNumber: person.documentNumber,
        firstName: person.firstName,
        lastName: person.lastName,
        businessName: person.businessName,
        email: person.email.toLowerCase(),
        phone: person.phone,
        address: person.address,
      },
      select: {
        id: true,
        active: true,
        documentTypeId: true,
        documentNumber: true,
        firstName: true,
        lastName: true,
        businessName: true,
        email: true,
        phone: true,
        address: true,
        documentType: { select: { code: true, name: true } },
      },
    });
  }

  async create(
    transaction: PersonTransaction,
    person: CreatePersonDto,
    email: string,
  ) {
    const resolvedPerson = await this.findOrCreateByDocument(transaction, {
      ...person,
      email,
    });

    return resolvedPerson.id;
  }

  async findAvailableForUserAccount(
    transaction: PersonTransaction,
    personId: string,
  ) {
    const person = await transaction.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        active: true,
        email: true,
        userAccount: { select: { personId: true } },
      },
    });

    if (!person || !person.active) {
      throw new NotFoundException("Active person not found");
    }
    if (!person.email) {
      throw new BadRequestException(
        "Person must have an email address before creating a user account",
      );
    }
    if (person.userAccount) {
      throw new ConflictException("Person already has a user account");
    }

    return person.id;
  }

  async update(
    transaction: Pick<PrismaService, "person">,
    personId: string,
    person: UpdatePersonDto,
  ) {
    return transaction.person.update({
      where: { id: personId },
      data: {
        ...(person.firstName !== undefined && {
          firstName: person.firstName,
        }),
        ...(person.lastName !== undefined && {
          lastName: person.lastName,
        }),
        ...(person.email !== undefined && {
          email: person.email.toLowerCase(),
        }),
        ...(person.phone !== undefined && { phone: person.phone }),
        ...(person.address !== undefined && { address: person.address }),
      },
    });
  }

  async updateProfile(
    transaction: PersonTransaction,
    personId: string,
    changes: UpdatePersonProfileDto,
  ) {
    const hasDocumentTypeId = changes.documentTypeId !== undefined;
    const hasDocumentNumber = changes.documentNumber !== undefined;
    if (hasDocumentTypeId !== hasDocumentNumber) {
      throw new BadRequestException(
        "documentTypeId and documentNumber must be provided together",
      );
    }

    if (hasDocumentTypeId && hasDocumentNumber) {
      const documentType = await transaction.documentType.findUnique({
        where: { id: changes.documentTypeId },
        select: { id: true, active: true },
      });
      if (!documentType || !documentType.active) {
        throw new NotFoundException("Active document type not found");
      }

      const personWithDocument = await transaction.person.findUnique({
        where: {
          documentTypeId_documentNumber: {
            documentTypeId: changes.documentTypeId!,
            documentNumber: changes.documentNumber!,
          },
        },
        select: { id: true },
      });
      if (personWithDocument && personWithDocument.id !== personId) {
        throw new ConflictException({
          code: "DOCUMENT_ALREADY_IN_USE",
          message: "This document is already associated with another person.",
          details: {},
        });
      }
    }

    const email = changes.email?.toLowerCase();
    if (email !== undefined) {
      const personWithEmail = await transaction.person.findFirst({
        where: {
          id: { not: personId },
          email: { equals: email, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (personWithEmail) {
        throw new ConflictException({
          code: "EMAIL_ALREADY_IN_USE",
          message:
            "This email address is already associated with another person.",
          details: {},
        });
      }
    }

    return transaction.person.update({
      where: { id: personId },
      data: {
        ...(hasDocumentTypeId && hasDocumentNumber
          ? {
              documentTypeId: changes.documentTypeId,
              documentNumber: changes.documentNumber,
            }
          : {}),
        ...(changes.firstName === undefined
          ? {}
          : { firstName: changes.firstName ?? null }),
        ...(changes.lastName === undefined
          ? {}
          : { lastName: changes.lastName ?? null }),
        ...(changes.businessName === undefined
          ? {}
          : { businessName: changes.businessName ?? null }),
        ...(email === undefined ? {} : { email }),
        ...(changes.phone === undefined ? {} : { phone: changes.phone }),
        ...(changes.address === undefined ? {} : { address: changes.address }),
      },
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
    });
  }
}
