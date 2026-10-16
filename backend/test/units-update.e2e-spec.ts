import { randomUUID } from "node:crypto";
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
const DOCUMENT_CODE = `CC-UP-${runId}`;
const unitName = (label: string) => `${runId} ${label}`;
const unitOf = (body: unknown) => (body as UnitMeasureResponse).data;
const errorOf = (body: unknown) =>
  (body as { error: { code: string; message: string; details: unknown } })
    .error;

describe("PATCH /api/v1/unit-measure/:unitMeasureId (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService | undefined;
  let documentTypeId: string;
  let sequence = 0;
  const tokens = {} as Record<RoleName, string>;
  const actorIds: string[] = [];
  const unitIds: string[] = [];

  const nextDocument = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const nextAbreviation = () => {
    sequence += 1;
    return `${runId}${sequence}`;
  };

  const patchUnit = (unitId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/unit-measure/${unitId}`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const patchUnitStatus = (unitId: string, body: object, token?: string) => {
    const pending = request(app.getHttpServer()).patch(
      `/api/v1/unit-measure/${unitId}/status`,
    );
    if (token) pending.set("Authorization", `Bearer ${token}`);
    return pending.send(body);
  };

  const createUnit = async (label: string, active = true) => {
    const unit = await prisma!.unitMeasure.create({
      data: {
        name: unitName(label),
        abreviation: nextAbreviation(),
        active,
      },
    });
    unitIds.push(unit.id);
    return unit;
  };

  const getUnit = (unitId: string) =>
    prisma!.unitMeasure.findUniqueOrThrow({ where: { id: unitId } });

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
          name: "CC (e2e editar unidad)",
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
          email: `${roleName.toLowerCase()}.units.update.${runId}@e2e.test`,
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
    try {
      if (!prisma) return;
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
    } finally {
      await app?.close();
    }
  }, 30000);

  describe("editing", () => {
    it("updates the name and abbreviation and records the audit log", async () => {
      const unit = await createUnit("Unidad inicial");
      const name = unitName("Unidad actualizada");
      const abreviation = nextAbreviation();

      const response = await patchUnit(
        unit.id,
        { name, abreviation },
        tokens.SUPERADMIN,
      ).expect(200);

      expect(unitOf(response.body)).toMatchObject({
        id: unit.id,
        name,
        abreviation,
        active: true,
      });
      expect(await getUnit(unit.id)).toMatchObject({
        name,
        abreviation,
        active: true,
      });

      const auditLog = await prisma!.auditLog.findFirst({
        where: { entity: "UNIT_MEASURE", entityId: unit.id, action: "UPDATE" },
      });
      expect(auditLog).toMatchObject({
        userId: actorIds[0],
        action: "UPDATE",
        entity: "UNIT_MEASURE",
        entityId: unit.id,
        oldData: {
          name: unit.name,
          abreviation: unit.abreviation,
          active: true,
        },
        newData: { name, abreviation, active: true },
      });
    });

    it("rejects an empty update and leaves the unit unchanged", async () => {
      const unit = await createUnit("Sin cambios");

      const response = await patchUnit(unit.id, {}, tokens.SUPERADMIN).expect(
        400,
      );

      expect(errorOf(response.body).code).toBe("BAD_REQUEST");
      expect(await getUnit(unit.id)).toMatchObject({
        name: unit.name,
        abreviation: unit.abreviation,
      });
    });

    it("rejects invalid update fields and leaves the unit unchanged", async () => {
      const unit = await createUnit("Campos inválidos");

      const response = await patchUnit(
        unit.id,
        { name: "Kg" },
        tokens.SUPERADMIN,
      ).expect(400);

      expect(errorOf(response.body)).toMatchObject({
        code: "BAD_REQUEST",
        message: "Request validation failed.",
      });
      expect(await getUnit(unit.id)).toMatchObject({
        name: unit.name,
        abreviation: unit.abreviation,
      });
    });

    it("rejects a duplicate name and leaves the unit unchanged", async () => {
      const unit = await createUnit("Nombre original");
      const duplicate = await createUnit("Nombre ocupado");

      await patchUnit(
        unit.id,
        { name: duplicate.name },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(await getUnit(unit.id)).toMatchObject({
        name: unit.name,
        abreviation: unit.abreviation,
      });
    });

    it("answers 404 when the unit does not exist", async () => {
      await patchUnit(
        randomUUID(),
        { name: unitName("No existe") },
        tokens.SUPERADMIN,
      ).expect(404);
    });

    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
      "rejects %s from editing a unit",
      async (roleName) => {
        const unit = await createUnit(`Edición denegada ${roleName}`);

        const response = await patchUnit(
          unit.id,
          { name: unitName(`No autorizada ${roleName}`) },
          tokens[roleName],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect((await getUnit(unit.id)).name).toBe(unit.name);
      },
    );
  });

  describe("status changes", () => {
    it("allows SUPERADMIN to deactivate and reactivate a unit", async () => {
      const unit = await createUnit("Cambio de estado");

      const deactivateResponse = await patchUnitStatus(
        unit.id,
        { active: false },
        tokens.SUPERADMIN,
      ).expect(200);
      expect(deactivateResponse.body).toEqual({
        data: { message: "Unit measure status updated successfully." },
      });
      expect((await getUnit(unit.id)).active).toBe(false);

      await patchUnitStatus(
        unit.id,
        { active: true },
        tokens.SUPERADMIN,
      ).expect(200);
      expect((await getUnit(unit.id)).active).toBe(true);

      const auditLogs = await prisma!.auditLog.findMany({
        where: { entity: "UNIT_MEASURE", entityId: unit.id },
        orderBy: { createdAt: "asc" },
      });
      expect(auditLogs).toHaveLength(2);
      expect(auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "DEACTIVATE",
            oldData: { active: true },
            newData: { active: false },
          }),
          expect.objectContaining({
            action: "ACTIVATE",
            oldData: { active: false },
            newData: { active: true },
          }),
        ]),
      );
    });

    it.each<RoleName>(["BRANCH_LEADER", "BRANCH_ASSISTANT", "DEV"])(
      "rejects %s from changing unit status",
      async (roleName) => {
        const unit = await createUnit(`Estado denegado ${roleName}`);

        const response = await patchUnitStatus(
          unit.id,
          { active: false },
          tokens[roleName],
        ).expect(403);

        expect(errorOf(response.body).code).toBe("INSUFFICIENT_PERMISSIONS");
        expect((await getUnit(unit.id)).active).toBe(true);
      },
    );

    it("rejects requests without an access token", async () => {
      const unit = await createUnit("Estado sin token");

      await patchUnitStatus(unit.id, { active: false }).expect(401);

      expect((await getUnit(unit.id)).active).toBe(true);
    });

    it("answers 409 when the unit is already in the requested state", async () => {
      const unit = await createUnit("Estado existente");

      const response = await patchUnitStatus(
        unit.id,
        { active: true },
        tokens.SUPERADMIN,
      ).expect(409);

      expect(errorOf(response.body)).toMatchObject({
        code: "ALREADY_IN_STATE",
        message: "Unit measure is already in the requested state.",
      });
      expect((await getUnit(unit.id)).active).toBe(true);
      expect(
        await prisma!.auditLog.count({
          where: { entity: "UNIT_MEASURE", entityId: unit.id },
        }),
      ).toBe(0);
    });
  });
});
