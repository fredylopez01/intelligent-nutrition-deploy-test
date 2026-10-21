import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const getId = (
  ids: Map<string, string>,
  key: string,
  entity: string,
): string => {
  const id = ids.get(key);

  if (!id) {
    throw new Error(`${entity} "${key}" was not seeded`);
  }

  return id;
};

async function main() {
  console.log("Starting database seed...");

  const documentTypes = [
    { code: "CC", name: "Cédula de Ciudadanía" },
    { code: "CE", name: "Cédula de Extranjería" },
    { code: "NIT", name: "Número de Identificación Tributaria" },
    { code: "PAS", name: "Pasaporte" },
  ];
  const documentTypeIds = new Map<string, string>();

  for (const documentType of documentTypes) {
    const seededDocumentType = await prisma.documentType.upsert({
      where: { code: documentType.code },
      update: { name: documentType.name, active: true },
      create: documentType,
    });
    documentTypeIds.set(documentType.code, seededDocumentType.id);
  }

  const roles = [
    {
      name: "SUPERADMIN",
      description: "System administrator with full access",
    },
    { name: "BRANCH_LEADER", description: "Branch leader" },
    { name: "BRANCH_ASSISTANT", description: "Branch assistant" },
    { name: "DEV", description: "Development and technical operations" },
  ];
  const roleIds = new Map<string, string>();

  for (const role of roles) {
    const seededRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, active: true },
      create: role,
    });
    roleIds.set(role.name, seededRole.id);
  }

  const people = [
    {
      key: "admin",
      documentTypeCode: "CC",
      documentNumber: "1000000000",
      firstName: "System",
      lastName: "Administrator",
      email: "intelligentnutrition.shop@gmail.com",
      phone: "0000000000",
      address: "System account",
    },
    {
      key: "leader-medellin",
      documentTypeCode: "CC",
      documentNumber: "1039456781",
      firstName: "Laura",
      lastName: "Restrepo",
      email: "laura.restrepo@example.com",
      phone: "3004567812",
      address: "Carrera 43A # 1-50, Medellín",
    },
    {
      key: "leader-bogota",
      documentTypeCode: "CC",
      documentNumber: "1012345678",
      firstName: "Andrés",
      lastName: "Mendoza",
      email: "andres.mendoza@example.com",
      phone: "3102345678",
      address: "Calle 93 # 15-20, Bogotá",
    },
    {
      key: "assistant-medellin",
      documentTypeCode: "CC",
      documentNumber: "1045678901",
      firstName: "Camila",
      lastName: "Vargas",
      email: "camila.vargas@example.com",
      phone: "3015678901",
      address: "Calle 10 # 35-12, Medellín",
    },
    {
      key: "assistant-bogota",
      documentTypeCode: "CC",
      documentNumber: "1023456789",
      firstName: "Santiago",
      lastName: "Pardo",
      email: "santiago.pardo@example.com",
      phone: "3153456789",
      address: "Carrera 11 # 82-10, Bogotá",
    },
    {
      key: "assistant-cali",
      documentTypeCode: "CC",
      documentNumber: "1112345678",
      firstName: "Valentina",
      lastName: "Rojas",
      email: "valentina.rojas@example.com",
      phone: "3162345678",
      address: "Avenida 6N # 23-45, Cali",
    },
    {
      key: "developer",
      documentTypeCode: "CC",
      documentNumber: "1009876543",
      firstName: "Mateo",
      lastName: "Gómez",
      email: "mateo.gomez@example.com",
      phone: "3209876543",
      address: "Carrera 70 # 45-30, Medellín",
    },
    {
      key: "customer-ana",
      documentTypeCode: "CC",
      documentNumber: "43876543",
      firstName: "Ana",
      lastName: "López",
      email: "ana.lopez@example.com",
      phone: "3001112233",
      address: "Calle 33 # 66B-18, Medellín",
    },
    {
      key: "customer-carlos",
      documentTypeCode: "CC",
      documentNumber: "79234567",
      firstName: "Carlos",
      lastName: "Ramírez",
      email: "carlos.ramirez@example.com",
      phone: "3102223344",
      address: "Carrera 15 # 100-25, Bogotá",
    },
    {
      key: "customer-lucia",
      documentTypeCode: "CE",
      documentNumber: "900123456",
      firstName: "Lucía",
      lastName: "Fernández",
      email: "lucia.fernandez@example.com",
      phone: "3203334455",
      address: "Avenida 6 # 24N-30, Cali",
    },
    {
      key: "customer-diego",
      documentTypeCode: "CC",
      documentNumber: "98765432",
      firstName: "Diego",
      lastName: "Torres",
      email: "diego.torres@example.com",
      phone: "3004445566",
      address: "Calle 8 # 43A-22, Medellín",
    },
    {
      key: "supplier-nutri",
      documentTypeCode: "NIT",
      documentNumber: "901234567-1",
      businessName: "Nutri Andina S.A.S.",
      email: "ventas@nutriandina.example",
      phone: "6044441000",
      address: "Carrera 52 # 14-80, Medellín",
    },
    {
      key: "supplier-vital",
      documentTypeCode: "NIT",
      documentNumber: "900765432-2",
      businessName: "Distribuciones Vitales S.A.S.",
      email: "pedidos@distribucionesvitales.example",
      phone: "6015552000",
      address: "Calle 17 # 68D-40, Bogotá",
    },
    {
      key: "supplier-natural",
      documentTypeCode: "NIT",
      documentNumber: "901876543-3",
      businessName: "Laboratorios Naturales del Valle S.A.S.",
      email: "comercial@naturalvalle.example",
      phone: "6026663000",
      address: "Carrera 5 # 28-60, Cali",
    },
  ];
  const personIds = new Map<string, string>();

  for (const person of people) {
    const documentTypeId = getId(
      documentTypeIds,
      person.documentTypeCode,
      "Document type",
    );
    const { key, documentTypeCode: _documentTypeCode, ...personData } = person;
    const seededPerson = await prisma.person.upsert({
      where: {
        documentTypeId_documentNumber: {
          documentTypeId,
          documentNumber: person.documentNumber,
        },
      },
      update: { ...personData, documentTypeId, active: true },
      create: { ...personData, documentTypeId },
    });
    personIds.set(key, seededPerson.id);
  }

  const userAccounts = [
    { personKey: "admin", roleName: "SUPERADMIN", branchNames: [] },
    {
      personKey: "leader-medellin",
      roleName: "BRANCH_LEADER",
      branchNames: ["Intelligent Nutrition - Medellín"],
    },
    {
      personKey: "leader-bogota",
      roleName: "BRANCH_LEADER",
      branchNames: ["Intelligent Nutrition - Bogotá"],
    },
    {
      personKey: "assistant-medellin",
      roleName: "BRANCH_ASSISTANT",
      branchNames: ["Intelligent Nutrition - Medellín"],
    },
    {
      personKey: "assistant-bogota",
      roleName: "BRANCH_ASSISTANT",
      branchNames: ["Intelligent Nutrition - Bogotá"],
    },
    {
      personKey: "assistant-cali",
      roleName: "BRANCH_ASSISTANT",
      branchNames: ["Intelligent Nutrition - Cali"],
    },
    { personKey: "developer", roleName: "DEV", branchNames: [] },
  ];
  const userIds = new Map<string, string>();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD environment variable is required");
  }

  const adminPasswordHash = await argon2.hash(adminPassword);
  const testPasswordHash = await argon2.hash("@Password123!");

  for (const account of userAccounts) {
    const personId = getId(personIds, account.personKey, "Person");
    const roleId = getId(roleIds, account.roleName, "Role");
    const passwordHash =
      account.personKey === "admin" ? adminPasswordHash : testPasswordHash;
    const seededAccount = await prisma.userAccount.upsert({
      where: { personId },
      update: {
        roleId,
        password: passwordHash,
        active: true,
        mustChangePassword: false,
      },
      create: {
        personId,
        roleId,
        password: passwordHash,
        active: true,
        mustChangePassword: false,
      },
    });
    userIds.set(account.personKey, seededAccount.personId);
  }

  const customers = [
    { personKey: "customer-ana", fullName: "Ana López" },
    { personKey: "customer-carlos", fullName: "Carlos Ramírez" },
    { personKey: "customer-lucia", fullName: "Lucía Fernández" },
    { personKey: "customer-diego", fullName: "Diego Torres" },
  ];

  for (const customer of customers) {
    const personId = getId(personIds, customer.personKey, "Person");
    await prisma.customer.upsert({
      where: { personId },
      update: { fullName: customer.fullName, active: true },
      create: { personId, fullName: customer.fullName },
    });
  }

  const suppliers = [
    {
      personKey: "supplier-nutri",
      commercialName: "Nutri Andina",
    },
    {
      personKey: "supplier-vital",
      commercialName: "Distribuciones Vitales",
    },
    {
      personKey: "supplier-natural",
      commercialName: "Laboratorios Naturales del Valle",
    },
  ];

  for (const supplier of suppliers) {
    const personId = getId(personIds, supplier.personKey, "Person");
    await prisma.supplier.upsert({
      where: { personId },
      update: { commercialName: supplier.commercialName, active: true },
      create: { personId, commercialName: supplier.commercialName },
    });
  }

  const branches = [
    {
      name: "Intelligent Nutrition - Medellín",
      address: "Carrera 43A # 1-50, Medellín",
      phone: "6044441001",
    },
    {
      name: "Intelligent Nutrition - Bogotá",
      address: "Calle 93 # 15-20, Bogotá",
      phone: "6015552001",
    },
    {
      name: "Intelligent Nutrition - Cali",
      address: "Avenida 6N # 23-45, Cali",
      phone: "6026663001",
    },
  ];
  const branchIds = new Map<string, string>();

  for (const branch of branches) {
    const seededBranch = await prisma.branch.upsert({
      where: { name: branch.name },
      update: { ...branch, active: true },
      create: branch,
    });
    branchIds.set(branch.name, seededBranch.id);
  }

  for (const account of userAccounts) {
    const userId = getId(userIds, account.personKey, "User account");

    for (const branchName of account.branchNames) {
      const branchId = getId(branchIds, branchName, "Branch");
      const assignmentDate = new Date("2025-01-01T00:00:00.000Z");

      await prisma.userBranch.upsert({
        where: {
          userId_branchId_assignmentDate: {
            userId,
            branchId,
            assignmentDate,
          },
        },
        update: { active: true, endDate: null },
        create: { userId, branchId, assignmentDate },
      });
    }
  }

  const categories = [
    {
      name: "Proteínas",
      description: "Proteínas en polvo y suplementos para recuperación.",
    },
    {
      name: "Vitaminas y minerales",
      description: "Vitaminas, minerales y fórmulas multinutrientes.",
    },
    {
      name: "Aminoácidos",
      description: "Aminoácidos esenciales y productos para entrenamiento.",
    },
    {
      name: "Control de peso",
      description: "Productos complementarios para planes de control de peso.",
    },
    {
      name: "Accesorios",
      description: "Accesorios para preparación y consumo de suplementos.",
    },
  ];
  const categoryIds = new Map<string, string>();

  for (const category of categories) {
    const seededCategory = await prisma.category.upsert({
      where: { name: category.name },
      update: { description: category.description, active: true },
      create: category,
    });
    categoryIds.set(category.name, seededCategory.id);
  }

  const units = [
    { name: "Unidad", abreviation: "und" },
    { name: "Gramo", abreviation: "g" },
    { name: "Mililitro", abreviation: "ml" },
    { name: "Cápsula", abreviation: "cap" },
    { name: "Servicio", abreviation: "serv" },
  ];
  const unitIds = new Map<string, string>();

  for (const unit of units) {
    const seededUnit = await prisma.unitMeasure.upsert({
      where: { name: unit.name },
      update: { abreviation: unit.abreviation, active: true },
      create: unit,
    });
    unitIds.set(unit.name, seededUnit.id);
  }

  const products = [
    {
      name: "Proteína Whey Vainilla 2 lb",
      referenceCode: "PRO-WHEY-VAN-2LB",
      description: "Proteína de suero sabor vainilla, presentación de 2 lb.",
      categoryName: "Proteínas",
      unitName: "Unidad",
      price: 189900,
    },
    {
      name: "Proteína Whey Chocolate 2 lb",
      referenceCode: "PRO-WHEY-CHO-2LB",
      description: "Proteína de suero sabor chocolate, presentación de 2 lb.",
      categoryName: "Proteínas",
      unitName: "Unidad",
      price: 189900,
    },
    {
      name: "Proteína vegetal natural 1 lb",
      referenceCode: "PRO-VEG-NAT-1LB",
      description: "Mezcla vegetal de arveja y arroz, sin saborizantes.",
      categoryName: "Proteínas",
      unitName: "Unidad",
      price: 124900,
    },
    {
      name: "Creatina monohidratada 300 g",
      referenceCode: "AMI-CREA-300G",
      description: "Creatina monohidratada micronizada.",
      categoryName: "Aminoácidos",
      unitName: "Unidad",
      price: 99900,
    },
    {
      name: "BCAA frutos rojos 300 g",
      referenceCode: "AMI-BCAA-300G",
      description: "Aminoácidos ramificados sabor frutos rojos.",
      categoryName: "Aminoácidos",
      unitName: "Unidad",
      price: 112900,
    },
    {
      name: "Multivitamínico diario 60 cápsulas",
      referenceCode: "VIT-MULTI-60C",
      description: "Complejo multivitamínico para consumo diario.",
      categoryName: "Vitaminas y minerales",
      unitName: "Unidad",
      price: 64900,
    },
    {
      name: "Vitamina C 1000 mg 30 cápsulas",
      referenceCode: "VIT-C-1000-30C",
      description: "Vitamina C de 1000 mg por cápsula.",
      categoryName: "Vitaminas y minerales",
      unitName: "Unidad",
      price: 42900,
    },
    {
      name: "Omega 3 1000 mg 60 cápsulas",
      referenceCode: "VIT-OMEGA3-60C",
      description: "Aceite de pescado con ácidos grasos omega 3.",
      categoryName: "Vitaminas y minerales",
      unitName: "Unidad",
      price: 79900,
    },
    {
      name: "Colágeno hidrolizado 300 g",
      referenceCode: "CON-COL-300G",
      description: "Colágeno hidrolizado sabor neutro.",
      categoryName: "Control de peso",
      unitName: "Unidad",
      price: 87900,
    },
    {
      name: "Fibra soluble 250 g",
      referenceCode: "CON-FIB-250G",
      description: "Mezcla de fibra soluble para bebidas.",
      categoryName: "Control de peso",
      unitName: "Unidad",
      price: 52900,
    },
    {
      name: "Shaker deportivo 700 ml",
      referenceCode: "ACC-SHAKER-700",
      description: "Botella mezcladora con tapa hermética.",
      categoryName: "Accesorios",
      unitName: "Unidad",
      price: 29900,
    },
    {
      name: "Cuchara medidora 30 g",
      referenceCode: "ACC-SCOOP-30G",
      description: "Cuchara medidora reutilizable para suplementos.",
      categoryName: "Accesorios",
      unitName: "Unidad",
      price: 4900,
    },
  ];
  const productIds = new Map<string, string>();

  for (const product of products) {
    const categoryId = getId(categoryIds, product.categoryName, "Category");
    const unitOfMeasureId = getId(unitIds, product.unitName, "Unit measure");
    const {
      categoryName: _categoryName,
      unitName: _unitName,
      ...productData
    } = product;
    const seededProduct = await prisma.product.upsert({
      where: { referenceCode: product.referenceCode },
      update: {
        ...productData,
        categoryId,
        unitOfMeasureId,
        active: true,
      },
      create: { ...productData, categoryId, unitOfMeasureId },
    });
    productIds.set(product.referenceCode, seededProduct.id);
  }

  const inventory = [
    {
      branch: "Medellín",
      product: "PRO-WHEY-VAN-2LB",
      quantity: 24,
      minimum: 5,
    },
    {
      branch: "Medellín",
      product: "PRO-WHEY-CHO-2LB",
      quantity: 18,
      minimum: 5,
    },
    {
      branch: "Medellín",
      product: "PRO-VEG-NAT-1LB",
      quantity: 12,
      minimum: 3,
    },
    { branch: "Medellín", product: "AMI-CREA-300G", quantity: 30, minimum: 8 },
    { branch: "Medellín", product: "AMI-BCAA-300G", quantity: 14, minimum: 4 },
    { branch: "Medellín", product: "VIT-MULTI-60C", quantity: 40, minimum: 10 },
    { branch: "Medellín", product: "VIT-C-1000-30C", quantity: 35, minimum: 8 },
    { branch: "Medellín", product: "VIT-OMEGA3-60C", quantity: 20, minimum: 5 },
    { branch: "Bogotá", product: "PRO-WHEY-VAN-2LB", quantity: 16, minimum: 5 },
    { branch: "Bogotá", product: "PRO-WHEY-CHO-2LB", quantity: 22, minimum: 5 },
    { branch: "Bogotá", product: "AMI-CREA-300G", quantity: 25, minimum: 8 },
    { branch: "Bogotá", product: "VIT-MULTI-60C", quantity: 28, minimum: 10 },
    { branch: "Bogotá", product: "CON-COL-300G", quantity: 17, minimum: 4 },
    { branch: "Cali", product: "PRO-VEG-NAT-1LB", quantity: 10, minimum: 3 },
    { branch: "Cali", product: "AMI-CREA-300G", quantity: 12, minimum: 5 },
    { branch: "Cali", product: "VIT-C-1000-30C", quantity: 3, minimum: 8 },
    { branch: "Cali", product: "ACC-SHAKER-700", quantity: 20, minimum: 5 },
    { branch: "Cali", product: "ACC-SCOOP-30G", quantity: 50, minimum: 10 },
  ];
  const expirationDate = new Date("2028-12-31T00:00:00.000Z");

  for (const item of inventory) {
    const branchId = getId(
      branchIds,
      `Intelligent Nutrition - ${item.branch}`,
      "Branch",
    );
    const productId = getId(productIds, item.product, "Product");

    await prisma.branchInventory.upsert({
      where: {
        branchId_productId_expirationDate: {
          branchId,
          productId,
          expirationDate,
        },
      },
      update: {
        quantity: item.quantity,
        minimumStock: item.minimum,
      },
      create: {
        branchId,
        productId,
        quantity: item.quantity,
        minimumStock: item.minimum,
        expirationDate,
      },
    });
  }

  const movements = [
    {
      product: "PRO-WHEY-VAN-2LB",
      branch: "Medellín",
      type: "ENTRY",
      quantity: 30,
      user: "leader-medellin",
      observation: "Ingreso inicial de inventario.",
      movementAt: new Date("2025-01-05T09:00:00.000Z"),
    },
    {
      product: "PRO-WHEY-VAN-2LB",
      branch: "Medellín",
      type: "EXIT",
      quantity: 6,
      user: "assistant-medellin",
      observation: "Salida por venta de mostrador.",
      movementAt: new Date("2025-01-12T14:30:00.000Z"),
    },
    {
      product: "AMI-CREA-300G",
      branch: "Bogotá",
      type: "ENTRY",
      quantity: 25,
      user: "leader-bogota",
      observation: "Recepción de pedido del proveedor.",
      movementAt: new Date("2025-02-03T10:15:00.000Z"),
    },
    {
      product: "VIT-C-1000-30C",
      branch: "Cali",
      type: "ADJUSTMENT_EXIT",
      quantity: 2,
      user: "assistant-cali",
      observation: "Ajuste por producto averiado.",
      movementAt: new Date("2025-02-10T16:00:00.000Z"),
    },
    {
      product: "PRO-WHEY-CHO-2LB",
      branch: "Bogotá",
      originBranch: "Medellín",
      type: "TRANSFER",
      quantity: 4,
      user: "leader-bogota",
      observation: "Traslado de producto desde Medellín.",
      movementAt: new Date("2025-02-14T11:45:00.000Z"),
    },
    {
      product: "ACC-SHAKER-700",
      branch: "Cali",
      type: "ADJUSTMENT_ENTRY",
      quantity: 3,
      user: "assistant-cali",
      observation: "Ajuste tras conteo físico.",
      movementAt: new Date("2025-02-18T08:20:00.000Z"),
    },
  ] as const;

  for (const movement of movements) {
    const productId = getId(productIds, movement.product, "Product");
    const userId = getId(userIds, movement.user, "User account");
    const branchId = movement.branch
      ? getId(branchIds, `Intelligent Nutrition - ${movement.branch}`, "Branch")
      : null;
    const originBranchId =
      "originBranch" in movement && movement.originBranch
        ? getId(
            branchIds,
            `Intelligent Nutrition - ${movement.originBranch}`,
            "Branch",
          )
        : null;
    const existingMovement = await prisma.inventoryMovement.findFirst({
      where: {
        productId,
        branchId,
        originBranchId,
        userId,
        movementType: movement.type,
        quantity: movement.quantity,
        movementAt: movement.movementAt,
      },
    });

    if (!existingMovement) {
      await prisma.inventoryMovement.create({
        data: {
          productId,
          branchId,
          originBranchId,
          userId,
          movementType: movement.type,
          quantity: movement.quantity,
          observation: movement.observation,
          movementAt: movement.movementAt,
        },
      });
    }
  }

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
