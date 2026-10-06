import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service.js";
import { CreatePersonDto } from "./dto/create-person.dto.js";
import { UpdatePersonDto } from "./dto/update-person.dto.js";

type PersonTransaction = Pick<PrismaService, "person" | "documentType">;

@Injectable()
export class PersonsService {
  async create(
    transaction: PersonTransaction,
    person: CreatePersonDto,
    email: string,
  ) {
    if (Boolean(person.documentTypeId) !== Boolean(person.documentNumber)) {
      throw new BadRequestException(
        "documentTypeId and documentNumber must be provided together",
      );
    }

    if (person.documentTypeId) {
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
            documentNumber: person.documentNumber!.trim(),
          },
        },
        select: { id: true },
      });
      if (existingPerson) {
        throw new ConflictException(
          "Person with this document already exists; use personId to associate the account",
        );
      }
    }

    const createdPerson = await transaction.person.create({
      data: {
        documentTypeId: person.documentTypeId,
        documentNumber: person.documentNumber?.trim(),
        firstName: person.firstName.trim(),
        lastName: person.lastName.trim(),
        email,
        phone: person.phone?.trim(),
        address: person.address?.trim(),
      },
      select: { id: true },
    });

    return createdPerson.id;
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
          firstName: person.firstName.trim(),
        }),
        ...(person.lastName !== undefined && {
          lastName: person.lastName.trim(),
        }),
        ...(person.email !== undefined && {
          email: person.email.trim().toLowerCase(),
        }),
        ...(person.phone !== undefined && { phone: person.phone.trim() }),
        ...(person.address !== undefined && { address: person.address.trim() }),
      },
    });
  }
}
