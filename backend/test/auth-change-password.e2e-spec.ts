import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/database/prisma/prisma.service.js";

const runId = Date.now().toString(36);

describe("POST /api/v1/auth/change-password (e2e)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let personId: string;
  let token: string;

  const CURRENT_PASSWORD = "CurrentPass1!";
  const NEW_PASSWORD = "NewPass2!x";

  const changePassword = (body: object, bearer?: string) => {
    const pending = request(app.getHttpServer()).post(
      "/api/v1/auth/change-password",
    );
    if (bearer) pending.set("Authorization", `Bearer ${bearer}`);
    return pending.send(body);
  };

  const storedHash = async () => {
    const user = await prisma.userAccount.findUnique({
      where: { personId },
      select: { password: true },
    });
    return user?.password ?? "";
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

    const role = await prisma.role.upsert({
      where: { name: "BRANCH_ASSISTANT" },
      update: { active: true },
      create: { name: "BRANCH_ASSISTANT" },
    });

    const person = await prisma.person.create({
      data: {
        firstName: "Change",
        lastName: `Password ${runId}`,
        email: `change.${runId}@e2e.test`,
        userAccount: {
          create: {
            roleId: role.id,
            active: true,
            mustChangePassword: false,
            password: await argon2.hash(CURRENT_PASSWORD),
            passwordResetToken: `reset-token-${runId}`,
            passwordResetTokenExpiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });

    personId = person.id;
    token = await jwtService.signAsync({ sub: person.id });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: personId } });
    await prisma.userAccount.deleteMany({ where: { personId } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await app.close();
  });

  it("changes the password and clears the pending reset token", async () => {
    const response = await changePassword(
      { currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD },
      token,
    ).expect(200);

    expect(response.body).toEqual({
      data: { message: "Password changed successfully." },
    });

    const hash = await storedHash();
    expect(await argon2.verify(hash, NEW_PASSWORD)).toBe(true);
    expect(await argon2.verify(hash, CURRENT_PASSWORD)).toBe(false);

    const user = await prisma.userAccount.findUnique({
      where: { personId },
      select: { passwordResetToken: true, passwordResetTokenExpiresAt: true },
    });
    expect(user?.passwordResetToken).toBeNull();
    expect(user?.passwordResetTokenExpiresAt).toBeNull();
  });

  it("rejects a wrong current password without touching the stored hash", async () => {
    const hashBefore = await storedHash();

    const response = await changePassword(
      { currentPassword: "WrongPass9!", newPassword: "AnotherPass3!" },
      token,
    ).expect(401);

    expect(response.body).toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "The provided credentials are invalid.",
      },
    });
    expect(await storedHash()).toBe(hashBefore);
  });

  it("rejects a new password equal to the current one", async () => {
    const hashBefore = await storedHash();

    const response = await changePassword(
      { currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD },
      token,
    ).expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: "PASSWORDS_ARE_EQUAL",
        message:
          "The new password must be different from the current password.",
      },
    });
    expect(await storedHash()).toBe(hashBefore);
  });

  it("requires an access token", async () => {
    await changePassword({
      currentPassword: NEW_PASSWORD,
      newPassword: "AnotherPass4!",
    }).expect(401);
  });

  it("rejects a new password that breaks the password policy", async () => {
    const response = await changePassword(
      { currentPassword: NEW_PASSWORD, newPassword: "Abc123" },
      token,
    ).expect(400);

    expect(response.body).toMatchObject({
      error: { code: "BAD_REQUEST", message: "Request validation failed." },
    });
    const details = (response.body as { error: { details: string[] } }).error
      .details;
    expect(details.join(" ")).toContain("newPassword");
  });
});
