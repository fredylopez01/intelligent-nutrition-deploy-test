import { jest, describe, beforeAll, afterAll, it, expect } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";

const { Test } = await import("@nestjs/testing");
const { APP_GUARD, Reflector } = await import("@nestjs/core");
const { AuditController } = await import("./audit.controller.js");
const { AuditService } = await import("./audit.service.js");
const { RolesGuard } = await import("../../common/guards/roles.guard.js");
const request = (await import("supertest")).default;

const auditServiceMock = {
  findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }),
};

describe("AuditController access", () => {
  let app: INestApplication;
  let roleName = "SUPERADMIN";

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: AuditService, useValue: auditServiceMock },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(
      (
        httpRequest: Request & { user?: AuthenticatedUser },
        _response: Response,
        next: NextFunction,
      ) => {
        httpRequest.user = { active: true, role: { name: roleName } };
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows SUPERADMIN to query audit logs", async () => {
    await request(app.getHttpServer()).get("/audit-logs").expect(200);
    expect(auditServiceMock.findAll).toHaveBeenCalled();
  });

  it("denies other roles", async () => {
    roleName = "DEV";
    await request(app.getHttpServer()).get("/audit-logs").expect(403);
  });
});
