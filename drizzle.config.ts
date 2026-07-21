import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required (copy .env.example to .env for local commands)",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./apps/backend/**/model.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
