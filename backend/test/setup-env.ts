import { resolveTestDatabaseUrl } from "./global-setup.js";

process.env.DATABASE_URL = resolveTestDatabaseUrl();
