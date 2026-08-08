import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../shared/schema";
import { createPortfolioClient } from "../../shared/turso-connection";

const databaseUrl = process.env.TURSO_DATABASE_URL;
if (!databaseUrl) throw new Error("TURSO_DATABASE_URL is required");

export const client = createPortfolioClient({
  url: databaseUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
  runtimeGuard: true,
});

export const db = drizzle(client, { schema });

// Kept as a small lifecycle surface for existing test and shutdown callers.
export const pool = { end: async () => client.close() };
