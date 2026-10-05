import "dotenv/config";
import { execSync } from "node:child_process";

export function resolveTestDatabaseUrl(): string {
  const testUrl = process.env.DATABASE_URL_TEST;

  if (!testUrl) {
    throw new Error(
      "DATABASE_URL_TEST is required to run the e2e tests against a dedicated database",
    );
  }

  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL_TEST must point to a different database than DATABASE_URL",
    );
  }

  return testUrl;
}

export default function globalSetup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: resolveTestDatabaseUrl() },
    stdio: "inherit",
  });
}
