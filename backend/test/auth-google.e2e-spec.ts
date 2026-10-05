import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication, type ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";
import { GoogleAuthGuard } from "../src/modules/auth/guards/google-auth.guard.js";

const runId = Date.now().toString(36);
const frontendUrl = "http://localhost:5173";

interface JwtPayload {
  sub: string;
}

describe("GET /api/v1/auth/google/callback (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const simulatedGoogle = { email: "" };
  const personIds = {} as Record<
    "active" | "inactiveAccount" | "inactivePerson" | "inactiveRole",
    string
  >;
  const emails = {} as Record<
    "active" | "inactiveAccount" | "inactivePerson" | "inactiveRole",
    string
  >;

  const activeRoleId = { current: "" };
  const inactiveRoleId = { current: "" };

  const callbackWith = (email: string) => {
    simulatedGoogle.email = email;
    return request(app.getHttpServer()).get("/api/v1/auth/google/callback");
  };

  const authErrorFrom = (location: string) =>
    new URL(location).searchParams.get("authError");

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(GoogleAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context
            .switchToHttp()
            .getRequest<{ user?: { email: string } }>();
          httpRequest.user = { email: simulatedGoogle.email };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const activeRole = await prisma.role.upsert({
      where: { name: `GOOGLE_E2E_${runId}` },
      update: { active: true },
      create: { name: `GOOGLE_E2E_${runId}`, active: true },
    });
    const inactiveRole = await prisma.role.upsert({
      where: { name: `GOOGLE_E2E_OFF_${runId}` },
      update: { active: false },
      create: { name: `GOOGLE_E2E_OFF_${runId}`, active: false },
    });
    activeRoleId.current = activeRole.id;
    inactiveRoleId.current = inactiveRole.id;

    emails.active = `google.active.${runId}@e2e.test`;
    emails.inactiveAccount = `google.inactive.${runId}@e2e.test`;
    emails.inactivePerson = `google.personoff.${runId}@e2e.test`;
    emails.inactiveRole = `google.roleoff.${runId}@e2e.test`;

    const active = await prisma.person.create({
      data: {
        firstName: "Google",
        lastName: "Activo",
        email: emails.active,
        userAccount: {
          create: {
            roleId: activeRole.id,
            active: true,
            mustChangePassword: false,
          },
        },
      },
    });
    personIds.active = active.id;

    const inactiveAccount = await prisma.person.create({
      data: {
        firstName: "Google",
        lastName: "CuentaOff",
        email: emails.inactiveAccount,
        userAccount: {
          create: {
            roleId: activeRole.id,
            active: false,
            mustChangePassword: false,
          },
        },
      },
    });
    personIds.inactiveAccount = inactiveAccount.id;

    const inactivePerson = await prisma.person.create({
      data: {
        firstName: "Google",
        lastName: "PersonaOff",
        email: emails.inactivePerson,
        active: false,
        userAccount: {
          create: {
            roleId: activeRole.id,
            active: true,
            mustChangePassword: false,
          },
        },
      },
    });
    personIds.inactivePerson = inactivePerson.id;

    const inactiveRoleUser = await prisma.person.create({
      data: {
        firstName: "Google",
        lastName: "RolOff",
        email: emails.inactiveRole,
        userAccount: {
          create: {
            roleId: inactiveRole.id,
            active: true,
            mustChangePassword: false,
          },
        },
      },
    });
    personIds.inactiveRole = inactiveRoleUser.id;
  });

  afterAll(async () => {
    const userIds = Object.values(personIds);
    await prisma.userAccount.deleteMany({
      where: { personId: { in: userIds } },
    });
    await prisma.person.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({
      where: { id: { in: [activeRoleId.current, inactiveRoleId.current] } },
    });
    await app.close();
  });

  describe("registered and active account", () => {
    it("redirects to the frontend with a valid access token and records the login", async () => {
      const response = await callbackWith(emails.active).expect(302);

      const location = response.headers.location ?? "";
      expect(location.startsWith(`${frontendUrl}/auth/google/callback#`)).toBe(
        true,
      );

      const url = new URL(location);
      const token = new URLSearchParams(url.hash.slice(1)).get("accessToken");
      expect(token).toEqual(expect.any(String));

      const payload = jwtService.verify<JwtPayload>(token as string);
      expect(payload.sub).toBe(personIds.active);

      const account = await prisma.userAccount.findUnique({
        where: { personId: personIds.active },
        select: { lastLoginAt: true },
      });
      expect(account?.lastLoginAt).not.toBeNull();
    });

    it("normalizes the email reported by Google before looking it up", async () => {
      const response = await callbackWith(
        `  Google.Active.${runId}@E2E.test  `,
      ).expect(302);

      expect(response.headers.location).toContain(
        `${frontendUrl}/auth/google/callback#`,
      );
    });
  });

  describe("email without an account", () => {
    it("redirects to the login page with GOOGLE_EMAIL_NOT_REGISTERED", async () => {
      const response = await callbackWith(
        `google.missing.${runId}@e2e.test`,
      ).expect(302);

      expect(response.headers.location).toBe(
        `${frontendUrl}/login?authError=GOOGLE_EMAIL_NOT_REGISTERED`,
      );
    });
  });

  describe("inactive account", () => {
    it("redirects to the login page with GOOGLE_ACCOUNT_INACTIVE", async () => {
      const response = await callbackWith(emails.inactiveAccount).expect(302);

      expect(authErrorFrom(response.headers.location ?? "")).toBe(
        "GOOGLE_ACCOUNT_INACTIVE",
      );
    });

    it("does not record the login for an inactive account", async () => {
      const account = await prisma.userAccount.findUnique({
        where: { personId: personIds.inactiveAccount },
        select: { lastLoginAt: true },
      });
      expect(account?.lastLoginAt).toBeNull();
    });

    it("rejects a deactivated person with GOOGLE_ACCOUNT_INACTIVE", async () => {
      const response = await callbackWith(emails.inactivePerson).expect(302);

      expect(authErrorFrom(response.headers.location ?? "")).toBe(
        "GOOGLE_ACCOUNT_INACTIVE",
      );
    });
  });

  describe("inactive role", () => {
    it("redirects to the login page with ROLE_INACTIVE", async () => {
      const response = await callbackWith(emails.inactiveRole).expect(302);

      expect(response.headers.location).toBe(
        `${frontendUrl}/login?authError=ROLE_INACTIVE`,
      );
      expect(authErrorFrom(response.headers.location ?? "")).toBe(
        "ROLE_INACTIVE",
      );
    });
  });
});
