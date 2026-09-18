import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module.js";
import { HealthController } from "./health/health.controller.js";

describe("AppModule (bootstrap)", () => {
  let app: TestingModule;

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_EXPIRES_IN = "15m";
    process.env.DATABASE_URL =
      "postgresql://test:test@localhost:5432/test";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "test@test.com";

    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("should compile the application module", () => {
    expect(app).toBeDefined();
  });

  it("should resolve HealthController", () => {
    const healthController = app.get(HealthController);
    expect(healthController).toBeDefined();
  });
});