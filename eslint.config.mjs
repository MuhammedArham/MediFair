import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["playwright-report/**", "test-results/**", ".e2e/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),
]);
