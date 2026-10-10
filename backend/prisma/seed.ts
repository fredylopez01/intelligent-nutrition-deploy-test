import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting database seed...");

  // =====================================================
  // DOCUMENT TYPES
  // =====================================================

  const documentTypes = [
    {
      code: "CC",
      name: "Cédula de Ciudadanía",
    },
    {
      code: "CE",
      name: "Cédula de Extranjería",
    },
    {
      code: "NIT",
      name: "Número de Identificación Tributaria",
    },
    {
      code: "PAS",
      name: "Pasaporte",
    },
  ];

  for (const documentType of documentTypes) {
    await prisma.documentType.upsert({
      where: {
        code: documentType.code,
      },
      update: {
        name: documentType.name,
        active: true,
      },
      create: {
        code: documentType.code,
        name: documentType.name,
      },
    });
  }

  // =====================================================
  // ROLES
  // =====================================================

  const roles = [
    {
      name: "SUPERADMIN",
      description: "System administrator with full access",
    },
    {
      name: "BRANCH_LEADER",
      description: "Branch leader",
    },
    {
      name: "BRANCH_ASSISTANT",
      description: "Branch assistant",
    },
    {
      name: "DEV",
      description: "Development and technical operations",
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: {
        name: role.name,
      },
      update: {
        description: role.description,
        active: true,
      },
      create: {
        name: role.name,
        description: role.description,
      },
    });
  }

  // =====================================================
  // INITIAL SUPERADMIN
  // =====================================================

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD environment variable is required");
  }

  const documentType = await prisma.documentType.findUnique({
    where: {
      code: "CC",
    },
  });

  const superadminRole = await prisma.role.findUnique({
    where: {
      name: "SUPERADMIN",
    },
  });

  if (!documentType) {
    throw new Error("CC document type was not created");
  }

  if (!superadminRole) {
    throw new Error("SUPERADMIN role was not created");
  }

  const passwordHash = await argon2.hash(adminPassword);

  // =====================================================
  // PERSON
  // =====================================================

  const person = await prisma.person.upsert({
    where: {
      documentTypeId_documentNumber: {
        documentTypeId: documentType.id,
        documentNumber: "1000000000",
      },
    },
    update: {
      firstName: "System",
      lastName: "Administrator",
      email: "intelligentnutrition.shop@gmail.com",
      phone: "0000000000",
      address: "System account",
      active: true,
    },
    create: {
      documentTypeId: documentType.id,
      documentNumber: "1000000000",
      firstName: "System",
      lastName: "Administrator",
      email: "intelligentnutrition.shop@gmail.com",
      phone: "0000000000",
      address: "System account",
      active: true,
    },
  });

  // =====================================================
  // USER ACCOUNT
  // =====================================================

  await prisma.userAccount.upsert({
    where: {
      personId: person.id,
    },
    update: {
      roleId: superadminRole.id,
      password: passwordHash,
      active: true,
      mustChangePassword: false,
    },
    create: {
      personId: person.id,
      roleId: superadminRole.id,
      password: passwordHash,
      active: true,
      mustChangePassword: false,
    },
  });

  console.log("Database seed completed successfully");
}

main()
  .catch((error) => {
    console.error("Seed failed");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
