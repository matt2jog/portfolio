import { defineConfig } from "drizzle-kit";
import { assertProductionMutationAllowed } from "./src/scripts/production-execution-guard";

const command = process.argv[2];
if (command === "migrate" || command === "push" || command === "up") {
  assertProductionMutationAllowed(process.env, `drizzle-kit ${command}`);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./src/migrations",
  schema: "./src/shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
