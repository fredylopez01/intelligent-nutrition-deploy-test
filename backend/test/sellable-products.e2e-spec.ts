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

interface SellableProduct {
  productId: string;
  name: string;
  referenceCode: string;
  primaryImageUrl: string | null;
  price: string;
  availableQuantity: number;
  unit: string;
  category: { id: string; name: string } | null;
}

interface SellableProductsResponse {
  data: SellableProduct[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const runId = randomUUID();
const documentCode = `SP-${runId}`.slice(0, 20);
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const todayUtc = () => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

describe("GET /api/v1/branches/:id/sellable-products (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let categoryId: string;
  let otherCategoryId: string;
  let unitOfMeasureId: string;
  let branchId: string;
  let superadminToken: string;
  let assistantToken: string;
  let unitAbbreviation: string;
  const actorIds: string[] = [];
  const productIds: string[] = [];
  const productIdByName = new Map<string, string>();

  const sellableUrl = (branch: string, query = "") =>
    `/api/v1/branches/${branch}/sellable-products${query}`;

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
      await prisma.documentType.upsert({
        where: { code: documentCode },
        update: { active: true },
        create: { code: documentCode, name: "Documento e2e productos" },
      })
    ).id;

    let actorSequence = 0;
    for (const [actorName, roleName] of [
      ["SUPERADMIN", "SUPERADMIN"],
      ["BRANCH_ASSISTANT", "BRANCH_ASSISTANT"],
    ] as const) {
      actorSequence += 1;
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: `${runId}-${actorSequence}`,
          firstName: actorName,
          lastName: "E2E",
          email: `${actorName.toLowerCase()}.sellable.${runId}@e2e.test`,
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
      actorIds.push(person.id);
      const token = await jwtService.signAsync({ sub: person.id });
      if (actorName === "SUPERADMIN") {
        superadminToken = token;
      } else {
        assistantToken = token;
      }
    }

    branchId = (
      await prisma.branch.create({
        data: {
          name: `Sede productos ${runId}`.slice(0, 100),
          address: "Avenida 5 # 12-34",
          phone: "3007776655",
          active: true,
        },
      })
    ).id;

    await prisma.userBranch.create({
      data: {
        userId: actorIds[1],
        branchId,
        assignmentDate: todayUtc(),
        active: true,
      },
    });

    categoryId = (
      await prisma.category.create({
        data: { name: `Categoria principal ${runId}`.slice(0, 100) },
      })
    ).id;
    otherCategoryId = (
      await prisma.category.create({
        data: { name: `Categoria ajena ${runId}`.slice(0, 100) },
      })
    ).id;
    unitAbbreviation = `U-${runId}`.slice(0, 10);
    unitOfMeasureId = (
      await prisma.unitMeasure.create({
        data: {
          name: `Unidad ${runId}`.slice(0, 50),
          abreviation: unitAbbreviation,
        },
      })
    ).id;

    const createProduct = async (options: {
      label: string;
      name: string;
      referenceCode: string;
      price: string;
      category: string;
      active?: boolean;
    }) => {
      const product = await prisma.product.create({
        data: {
          name: options.name,
          referenceCode: options.referenceCode,
          categoryId: options.category,
          unitOfMeasureId,
          price: options.price,
          active: options.active ?? true,
        },
      });
      productIds.push(product.id);
      productIdByName.set(options.label, product.id);
      return product.id;
    };

    const createLot = async (productId: string, quantity: number) =>
      prisma.branchInventory.create({
        data: {
          branchId,
          productId,
          quantity,
          minimumStock: 0,
          expirationDate: daysFromNow(30),
        },
      });

    const productAId = await createProduct({
      label: "A",
      name: `Alimento A ${runId}`.slice(0, 150),
      referenceCode: `A-${runId}`.slice(0, 50),
      price: "10.00",
      category: categoryId,
    });
    const productBId = await createProduct({
      label: "B",
      name: `Alimento B ${runId}`.slice(0, 150),
      referenceCode: `B-${runId}`.slice(0, 50),
      price: "12.50",
      category: categoryId,
    });
    const productCId = await createProduct({
      label: "C",
      name: `Alimento C ${runId}`.slice(0, 150),
      referenceCode: `C-${runId}`.slice(0, 50),
      price: "14.00",
      category: categoryId,
    });
    const searchProductId = await createProduct({
      label: "search",
      name: `Busqueda Especial ${runId}`.slice(0, 150),
      referenceCode: `BUSQ-${runId}`.slice(0, 50),
      price: "8.00",
      category: categoryId,
    });

    await createLot(productAId, 15);
    await createLot(productBId, 10);
    await createLot(productCId, 5);
    await createLot(productCId, 3);
    await createLot(searchProductId, 8);

    const noLotProductId = await createProduct({
      label: "noLot",
      name: `Sin Lote ${runId}`.slice(0, 150),
      referenceCode: `NOLOT-${runId}`.slice(0, 50),
      price: "1.00",
      category: categoryId,
    });
    const zeroStockProductId = await createProduct({
      label: "zeroStock",
      name: `Stock Cero ${runId}`.slice(0, 150),
      referenceCode: `ZERO-${runId}`.slice(0, 50),
      price: "3.00",
      category: categoryId,
    });
    await createLot(zeroStockProductId, 0);

    const inactiveProductId = await createProduct({
      label: "inactive",
      name: `Inactivo ${runId}`.slice(0, 150),
      referenceCode: `INACT-${runId}`.slice(0, 50),
      price: "4.00",
      category: categoryId,
      active: false,
    });
    await createLot(inactiveProductId, 20);

    const otherCategoryProductId = await createProduct({
      label: "otherCategory",
      name: `Categoria Ajena ${runId}`.slice(0, 150),
      referenceCode: `AJENA-${runId}`.slice(0, 50),
      price: "7.00",
      category: otherCategoryId,
    });
    await createLot(otherCategoryProductId, 12);

    expect(noLotProductId).toBeDefined();
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.branchInventory.deleteMany({ where: { branchId } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.category.deleteMany({
        where: { id: { in: [categoryId, otherCategoryId] } },
      });
      await prisma.unitMeasure.deleteMany({ where: { id: unitOfMeasureId } });
      await prisma.userBranch.deleteMany({
        where: { userId: { in: actorIds } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: actorIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: actorIds } } });
      await prisma.branch.deleteMany({ where: { id: branchId } });
      await prisma.documentType.deleteMany({ where: { id: documentTypeId } });
    } finally {
      await app?.close();
    }
  }, 30000);

  it("lists the products of the branch that have stock", async () => {
    const response = await request(app.getHttpServer())
      .get(sellableUrl(branchId))
      .set("Authorization", `Bearer ${assistantToken}`)
      .expect(200);

    const body = response.body as SellableProductsResponse;

    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 5,
      totalPages: 1,
    });
    expect(body.data.map(({ name }) => name)).toEqual([
      `Alimento A ${runId}`,
      `Alimento B ${runId}`,
      `Alimento C ${runId}`,
      `Busqueda Especial ${runId}`,
      `Categoria Ajena ${runId}`,
    ]);

    const returnedIds = body.data.map(({ productId }) => productId);
    expect(returnedIds).not.toContain(productIdByName.get("noLot"));
    expect(returnedIds).not.toContain(productIdByName.get("zeroStock"));
    expect(returnedIds).not.toContain(productIdByName.get("inactive"));

    expect(body.data[0]).toEqual({
      productId: productIdByName.get("A"),
      name: `Alimento A ${runId}`,
      referenceCode: `A-${runId}`,
      primaryImageUrl: null,
      price: "10.00",
      availableQuantity: 15,
      unit: unitAbbreviation,
      category: { id: categoryId, name: `Categoria principal ${runId}` },
    });

    const productC = body.data.find(
      ({ productId }) => productId === productIdByName.get("C"),
    );
    expect(productC?.availableQuantity).toBe(8);
  });

  it("paginates the sellable products", async () => {
    const firstPage = await request(app.getHttpServer())
      .get(sellableUrl(branchId, "?page=1&limit=2"))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get(sellableUrl(branchId, "?page=2&limit=2"))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(200);
    const thirdPage = await request(app.getHttpServer())
      .get(sellableUrl(branchId, "?page=3&limit=2"))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(200);

    const first = firstPage.body as SellableProductsResponse;
    const second = secondPage.body as SellableProductsResponse;
    const third = thirdPage.body as SellableProductsResponse;

    expect(first.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    expect(second.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(third.meta).toEqual({ page: 3, limit: 2, total: 5, totalPages: 3 });

    expect(first.data.map(({ productId }) => productId)).toEqual([
      productIdByName.get("A"),
      productIdByName.get("B"),
    ]);
    expect(second.data.map(({ productId }) => productId)).toEqual([
      productIdByName.get("C"),
      productIdByName.get("search"),
    ]);
    expect(third.data.map(({ productId }) => productId)).toEqual([
      productIdByName.get("otherCategory"),
    ]);
  });

  it("filters the sellable products by search on name and reference code", async () => {
    const byName = await request(app.getHttpServer())
      .get(sellableUrl(branchId, "?search=busqueda"))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(200);
    const byReference = await request(app.getHttpServer())
      .get(sellableUrl(branchId, `?search=BUSQ-${runId}`))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(200);

    const nameBody = byName.body as SellableProductsResponse;
    expect(nameBody.meta.total).toBe(1);
    expect(nameBody.data).toHaveLength(1);
    expect(nameBody.data[0]).toEqual({
      productId: productIdByName.get("search"),
      name: `Busqueda Especial ${runId}`,
      referenceCode: `BUSQ-${runId}`,
      primaryImageUrl: null,
      price: "8.00",
      availableQuantity: 8,
      unit: unitAbbreviation,
      category: { id: categoryId, name: `Categoria principal ${runId}` },
    });

    const referenceBody = byReference.body as SellableProductsResponse;
    expect(referenceBody.meta.total).toBe(1);
    expect(referenceBody.data[0].productId).toBe(productIdByName.get("search"));
  });

  it("filters the sellable products by category", async () => {
    const otherCategory = await request(app.getHttpServer())
      .get(sellableUrl(branchId, `?categoryId=${otherCategoryId}`))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(200);
    const mainCategory = await request(app.getHttpServer())
      .get(sellableUrl(branchId, `?categoryId=${categoryId}`))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(200);

    const otherBody = otherCategory.body as SellableProductsResponse;
    expect(otherBody.meta.total).toBe(1);
    expect(otherBody.data).toHaveLength(1);
    expect(otherBody.data[0]).toEqual({
      productId: productIdByName.get("otherCategory"),
      name: `Categoria Ajena ${runId}`,
      referenceCode: `AJENA-${runId}`,
      primaryImageUrl: null,
      price: "7.00",
      availableQuantity: 12,
      unit: unitAbbreviation,
      category: { id: otherCategoryId, name: `Categoria ajena ${runId}` },
    });

    const mainBody = mainCategory.body as SellableProductsResponse;
    expect(mainBody.meta.total).toBe(4);
    expect(mainBody.data).toHaveLength(4);
  });

  it("returns 404 when the branch does not exist", async () => {
    const response = await request(app.getHttpServer())
      .get(sellableUrl(randomUUID()))
      .set("Authorization", `Bearer ${superadminToken}`)
      .expect(404);

    expect(errorOf(response.body).code).toBe("BRANCH_NOT_FOUND");
  });

  it("returns 401 when the request has no authentication token", async () => {
    await request(app.getHttpServer()).get(sellableUrl(branchId)).expect(401);
  });
});
