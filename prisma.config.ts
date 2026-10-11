import "./src/lib/load-env";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/postgres-migrations" },
  datasource: { url: process.env.DIRECT_URL || env("DATABASE_URL") },
});
