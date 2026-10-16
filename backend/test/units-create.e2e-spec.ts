import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

type RoleName = "SUPERADMIN" | "BRANCH_LEADER" | "BRANCH_ASSISTANT" | "DEV";

interface UnitMeasureResponse {
  data: {
    id: string;
    name: string;
    abreviation: string;
    active: boolean;
  };
}

const runId = Date.now().toString(36);
const DOCUMENT_CODE = `CC-UNIT-${runId}`;
const unitName = (label: string) => `${runId} ${label}`;
const unitOf = (body: unknown) => (body as UnitMeasureResponse).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

describe("POST /api/v1/unit-measure (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const nextAbreviation = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const postUnit = (body: object, token?: string) => {
    const pending = request(app.getHttpServer()).post("/api/v1/unit-measure");
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const unitCount = (name: string) =>
    prisma.unitMeasure.count({ where: { name } });

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
        create: {
          code: DOCUMENT_CODE,
          name: "Cédula (e2e crear unidad)",
        },
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
          email: `${roleName.toLowerCase()}.units.create.${runId}@e2e.test`,
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
  }, 30000);

  afterAll(async () => {
    const createdUnits = await prisma.unitMeasure.findMany({
      where: { name: { startsWith: runId } },
      select: { id: true },
    });
    const unitIds = createdUnits.map(({ id }) => id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ userId: { in: actorIds } }, { entityId: { in: unitIds } }],
      },
    });
    await prisma.unitMeasure.deleteMany({
      where: { id: { in: unitIds } },
    });
    await prisma.userAccount.deleteMany({
      where: { personId: { in: actorIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: actorIds } } });
    await prisma.documentType.deleteMany({
      where: { code: DOCUMENT_CODE },
    });
    await app.close();
  }, 30000);

  describe("creation", () => {
    it("creates a unit of measure and records the audit log", async () => {
      const name = unitName("Kilogramo");
      const abreviation = nextAbreviation();

      const response = await postUnit(
        { name, abreviation },
        tokens.SUPERADMIN,
      ).expect(201);

      const unit = unitOf(response.body);
      expect(unit).toMatchObject({
        id: expect.any(String),
        name,
        abreviation,
        active: true,
      });
      expect(await unitCount(name)).toBe(1);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entity: "UNIT_MEASURE",
          entityId: unit.id,
          action: "CREATE",
        },
      });
      expect(auditLog).toMatchObject({
        userId: actorIds[0],
        action: "CREATE",
        entity: "UNIT_MEASURE",
        entityId: unit.id,
        newData: { name, abreviation, active: true },
      });
    });
  });

  describe("required fields", () => {
    const missingFields: Array<[string, Record<string, unknown>]> = [
      ["name", { abreviation: "kg" }],
      ["abreviation", { name: unitName("Sin abreviatura") }],
    ];

    it.each(missingFields)(
      "rejects a request missing %s",
      async (field, payload) => {
        const response = await postUnit(payload, tokens.SUPERADMIN).expect(400);

        expect(errorOf(response.body)).toMatchObject({
          code: "BAD_REQUEST",
          message: "Request validation failed.",
        });
        expect(errorOf(response.body).details).toEqual(
          expect.arrayContaining([expect.stringContaining(field)]),
        );
        if (typeof payload.name === "string") {
          expect(await unitCount(payload.name)).toBe(0);
        }
      },
    );
  });

  describe("duplicate values", () => {
    it("answers 409 when a unit with the same name already exists", async () => {
      const name = unitName("Duplicada");
      await prisma.unitMeasure.create({
        data: { name, abreviation: nextAbreviation() },
      });

      const response = await postUnit(
        { name, abreviation: nextAbreviation() },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "UNIT_NAME_ALREADY_EXISTS",
        message: "Unit Measure with this name already exists",
      });
      expect(await unitCount(name)).toBe(1);
    });

    it("answers 409 when a unit with the same abreviation already exists", async () => {
      const abreviation = nextAbreviation();
      await prisma.unitMeasure.create({
        data: { name: unitName("Abreviatura existente"), abreviation },
      });

      const response = await postUnit(
        { name: unitName("Abreviatura duplicada"), abreviation },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "UNIT_ABBREVIATION_ALREADY_EXISTS",
        message: "Unit Measure with this abreviation already exists",
      });
      expect(await prisma.unitMeasure.count({ where: { abreviation } })).toBe(
        1,
      );
    });
  });

  describe("role access", () => {
    it.each<RoleName>(["SUPERADMIN", "BRANCH_LEADER", "DEV"])(
      "allows %s to create a unit of measure",
      async (roleName) => {
        const name = unitName(`Permitida ${roleName}`);
        const abreviation = nextAbreviation();

        const response = await postUnit(
          { name, abreviation },
          tokens[roleName],
        ).expect(201);

        expect(unitOf(response.body)).toMatchObject({
          name,
          abreviation,
          active: true,
        });
        expect(await unitCount(name)).toBe(1);
      },
    );

    it("rejects BRANCH_ASSISTANT with 403 without creating a unit", async () => {
      const name = unitName("No autorizada");

      const response = await postUnit(
        { name, abreviation: nextAbreviation() },
        tokens.BRANCH_ASSISTANT,
      ).expect(403);

      expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
      expect(await unitCount(name)).toBe(0);
    });

    it("rejects requests without an access token", async () => {
      const name = unitName("Sin token");

      await postUnit({ name, abreviation: nextAbreviation() }).expect(401);

      expect(await unitCount(name)).toBe(0);
    });
  });
});
