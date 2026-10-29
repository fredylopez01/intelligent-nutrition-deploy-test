import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

interface Availability {
  product: { id: string; name: string; referenceCode: string };
  branches: {
    branchId: string;
    branchName: string;
    quantity: number;
  }[];
}

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-AV-${runId}`;
const ROLE_NAMES = ["SUPERADMIN", "DEV"] as const;
type RoleName = (typeof ROLE_NAMES)[number];

const availabilityOf = (body: unknown): Availability => {
  const outer = (body as { data: Record<string, unknown> }).data;
  const inner = ("data" in outer ? outer.data : outer) as {
    data?: unknown;
    product?: unknown;
  };
  return ("data" in inner ? inner.data : inner) as Availability;
};

const errorOf = (body: unknown) => (body as ApiError).error;

describe("GET /api/v1/inventory/availability (e2e)", () => {
  let app: INestApplication<App> | undefined;
  let prisma: PrismaService | undefined;
  let documentTypeId = "";
  let categoryId = "";
  let unitOfMeasureId = "";
  let productId = "";
  let productWithoutOtherStockId = "";
  let currentBranchId = "";
  let stockedBranchId = "";
  let emptyBranchId = "";
  let currentOnlyBranchId = "";
  let currentOnlyOtherBranchId = "";
  const personIds: string[] = [];
  const tokens = {} as Record<RoleName, string>;

  const getAvailability = (query: Record<string, string>, token?: string) => {
    const pending = request(app!.getHttpServer())
      .get("/api/v1/inventory/availability")
      .query(query);
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const jwtService = app.get(JwtService);

    documentTypeId = (
      await prisma.documentType.create({
        data: { code: DOCUMENT_CODE, name: "Documento (e2e availability)" },
      })
    ).id;

    for (const [index, roleName] of ROLE_NAMES.entries()) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}${index}`,
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.availability.${runId}@e2e.test`,
          phone: "3009998877",
          address: "Carrera 9 # 8-7",
          userAccount: {
            create: {
              roleId: role.id,
              active: true,
              mustChangePassword: false,
            },
          },
        },
      });
      personIds.push(person.id);
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const createBranch = async (label: string) =>
      (
        await prisma!.branch.create({
          data: {
            name: `${runId} ${label}`,
            address: "Calle 1 # 2-3",
            phone: "3001112233",
            active: true,
          },
        })
      ).id;
    currentBranchId = await createBranch("Availability Current");
    stockedBranchId = await createBranch("Availability Stocked");
    emptyBranchId = await createBranch("Availability Empty");
    currentOnlyBranchId = await createBranch("Availability Current Only");
    currentOnlyOtherBranchId = await createBranch("Availability Other Empty");

    categoryId = (
      await prisma.category.create({
        data: { name: `${runId} Availability Category`, active: true },
      })
    ).id;
    unitOfMeasureId = (
      await prisma.unitMeasure.create({
        data: {
          name: `${runId} Availability Unit`,
          abreviation: `AV${runId.slice(-7)}`,
          active: true,
        },
      })
    ).id;

    const productData = {
      categoryId,
      unitOfMeasureId,
      price: "1000.00",
      active: true,
    };
    productId = (
      await prisma.product.create({
        data: {
          ...productData,
          name: `${runId} Availability Product`,
          referenceCode: `AV-${runId}`,
        },
      })
    ).id;
    productWithoutOtherStockId = (
      await prisma.product.create({
        data: {
          ...productData,
          name: `${runId} Current Only Product`,
          referenceCode: `AV-CURRENT-${runId}`,
        },
      })
    ).id;

    await prisma.branchInventory.createMany({
      data: [
        {
          branchId: currentBranchId,
          productId,
          quantity: 11,
          minimumStock: 1,
          expirationDate: new Date("2027-01-01T00:00:00.000Z"),
        },
        {
          branchId: stockedBranchId,
          productId,
          quantity: 5,
          minimumStock: 1,
          expirationDate: new Date("2027-01-01T00:00:00.000Z"),
        },
        {
          branchId: currentOnlyBranchId,
          productId: productWithoutOtherStockId,
          quantity: 7,
          minimumStock: 1,
          expirationDate: new Date("2027-01-01T00:00:00.000Z"),
        },
      ],
    });
  }, 30000);

  afterAll(async () => {
    try {
      if (prisma) {
        const productIds = [productId, productWithoutOtherStockId].filter(
          Boolean,
        );
        const branchIds = [
          currentBranchId,
          stockedBranchId,
          emptyBranchId,
          currentOnlyBranchId,
          currentOnlyOtherBranchId,
        ].filter(Boolean);

        await prisma.branchInventory.deleteMany({
          where: { productId: { in: productIds } },
        });
        await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
        await prisma.product.deleteMany({
          where: { id: { in: productIds } },
        });
        await prisma.category.deleteMany({ where: { id: categoryId } });
        await prisma.unitMeasure.deleteMany({
          where: { id: unitOfMeasureId },
        });
        await prisma.userAccount.deleteMany({
          where: { personId: { in: personIds } },
        });
        await prisma.person.deleteMany({ where: { id: { in: personIds } } });
        await prisma.documentType.deleteMany({
          where: { id: documentTypeId },
        });
      }
    } finally {
      await app?.close();
    }
  }, 30000);

  it("returns availability from other branches and excludes the current branch", async () => {
    const response = await getAvailability(
      { productId, excludeBranchId: currentBranchId },
      tokens.SUPERADMIN,
    ).expect(200);
    const result = availabilityOf(response.body);
    const fixtureBranches = result.branches.filter(({ branchName }) =>
      branchName.startsWith(runId),
    );

    expect(result.product).toEqual({
      id: productId,
      name: `${runId} Availability Product`,
      referenceCode: `AV-${runId}`,
    });
    expect(fixtureBranches).toEqual([
      {
        branchId: currentOnlyBranchId,
        branchName: `${runId} Availability Current Only`,
        quantity: 0,
      },
      {
        branchId: emptyBranchId,
        branchName: `${runId} Availability Empty`,
        quantity: 0,
      },
      {
        branchId: currentOnlyOtherBranchId,
        branchName: `${runId} Availability Other Empty`,
        quantity: 0,
      },
      {
        branchId: stockedBranchId,
        branchName: `${runId} Availability Stocked`,
        quantity: 5,
      },
    ]);
    expect(fixtureBranches.map(({ branchId: id }) => id)).not.toContain(
      currentBranchId,
    );
  });

  it("returns zero availability in other branches when stock exists only at the current branch", async () => {
    const response = await getAvailability(
      {
        productId: productWithoutOtherStockId,
        excludeBranchId: currentOnlyBranchId,
      },
      tokens.SUPERADMIN,
    ).expect(200);
    const result = availabilityOf(response.body);
    const fixtureBranches = result.branches.filter(({ branchName }) =>
      branchName.startsWith(runId),
    );

    expect(fixtureBranches).toHaveLength(4);
    expect(fixtureBranches.every(({ quantity }) => quantity === 0)).toBe(true);
    expect(fixtureBranches.map(({ branchId: id }) => id)).not.toContain(
      currentOnlyBranchId,
    );
  });

  it("returns 404 when the product does not exist", async () => {
    const response = await getAvailability(
      { productId: randomUUID() },
      tokens.SUPERADMIN,
    ).expect(404);

    expect(errorOf(response.body).code).toBe("PRODUCT_NOT_FOUND");
  });

  it("returns 401 without authentication", async () => {
    await getAvailability({ productId }).expect(401);
  });

  it("returns 403 when the authenticated user lacks permission", async () => {
    const response = await getAvailability({ productId }, tokens.DEV).expect(
      403,
    );

    expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
  });
});
