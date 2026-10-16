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

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-PS-${runId}`;

const errorCode = (body: unknown) =>
  (body as { error: { code: string } }).error.code;

describe("PATCH /api/v1/products/:productId/status (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService | undefined;
  let documentTypeId: string;
  let categoryId: string;
  let unitOfMeasureId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];
  const productIds: string[] = [];

  const patchStatus = (productId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/products/${productId}/status`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const createProduct = async (active: boolean) => {
    sequence += 1;
    const product = await prisma!.product.create({
      data: {
        name: `${runId} Producto ${sequence}`,
        referenceCode: `PS-${runId}-${sequence}`,
        categoryId,
        unitOfMeasureId,
        price: "10.00",
        active,
      },
    });
    productIds.push(product.id);
    return product.id;
  };

  const isActive = async (productId: string) =>
    (await prisma!.product.findUniqueOrThrow({ where: { id: productId } }))
      .active;

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
        where: { code: DOCUMENT_CODE },
        update: { active: true },
        create: { code: DOCUMENT_CODE, name: "CC (e2e productos estado)" },
      })
    ).id;

    const roleNames: RoleName[] = [
      "SUPERADMIN",
      "BRANCH_LEADER",
      "BRANCH_ASSISTANT",
      "DEV",
    ];

    for (const roleName of roleNames) {
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: { active: true },
        create: { name: roleName },
      });
      const person = await prisma.person.create({
        data: {
          documentTypeId,
          documentNumber: nextDocument(),
          firstName: roleName,
          lastName: "E2E",
          email: `${roleName.toLowerCase()}.products.status.${runId}@e2e.test`,
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
      tokens[roleName] = await jwtService.signAsync({ sub: person.id });
    }

    const category = await prisma.category.create({
      data: { name: `${runId} Cat Estado`, active: true },
    });
    categoryId = category.id;

    const unit = await prisma.unitMeasure.create({
      data: {
        name: `${runId} Unidad Estado`,
        abreviation: `S${runId}`,
        active: true,
      },
    });
    unitOfMeasureId = unit.id;
  }, 30000);

  afterAll(async () => {
    try {
      if (!prisma) return;

      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: { in: actorIds } },
            { entityId: { in: productIds } },
          ],
        },
      });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.category.deleteMany({
        where: { id: { in: [categoryId].filter(Boolean) } },
      });
      await prisma.unitMeasure.deleteMany({
        where: { id: { in: [unitOfMeasureId].filter(Boolean) } },
      });
      await prisma.userAccount.deleteMany({
        where: { personId: { in: actorIds } },
      });
      await prisma.person.deleteMany({ where: { id: { in: actorIds } } });
      await prisma.documentType.deleteMany({ where: { code: DOCUMENT_CODE } });
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("allowed roles", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER"])(
      "lets %s deactivate a product and records the audit log",
      async (roleName) => {
        const productId = await createProduct(true);

        const response = await patchStatus(
          productId,
          { active: false },
          tokens[roleName],
        ).expect(200);

        expect(response.body).toEqual({
          data: { message: "Product status updated successfully." },
        });
        expect(await isActive(productId)).toBe(false);
        const logs = await prisma!.auditLog.findMany({
          where: { entity: "PRODUCT", entityId: productId },
        });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          action: "DEACTIVATE",
          oldData: { active: true },
          newData: { active: false },
        });
      },
    );

    it("lets the branch leader activate an inactive product", async () => {
      const productId = await createProduct(false);

      await patchStatus(
        productId,
        { active: true },
        tokens.BRANCH_LEADER,
      ).expect(200);

      expect(await isActive(productId)).toBe(true);
    });
  });

  describe("rejected roles", () => {
    it.each<RoleName>(["BRANCH_ASSISTANT", "DEV"])(
      "rejects %s with 403 and leaves the product unchanged",
      async (roleName) => {
        const productId = await createProduct(true);

        const response = await patchStatus(
          productId,
          { active: false },
          tokens[roleName],
        ).expect(403);

        expect(errorCode(response.body)).toBe("INSUFFICIENT_PERMISSIONS");
        expect(await isActive(productId)).toBe(true);
      },
    );

    it("rejects a request without token with 401", async () => {
      const productId = await createProduct(true);

      await patchStatus(productId, { active: false }).expect(401);

      expect(await isActive(productId)).toBe(true);
    });
  });

  describe("business rules", () => {
    it("answers 409 ALREADY_IN_STATE when the state does not change", async () => {
      const productId = await createProduct(true);

      const response = await patchStatus(
        productId,
        { active: true },
        tokens.BRANCH_LEADER,
      ).expect(409);

      expect(errorCode(response.body)).toBe("ALREADY_IN_STATE");
      expect(await isActive(productId)).toBe(true);
      expect(
        await prisma!.auditLog.count({
          where: { entity: "PRODUCT", entityId: productId },
        }),
      ).toBe(0);
    });

    it("answers 404 for a product that does not exist", async () => {
      await patchStatus(
        randomUUID(),
        { active: false },
        tokens.BRANCH_LEADER,
      ).expect(404);
    });
  });
});
