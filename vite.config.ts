import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

/* ========================================================================
 * Frontend Configuration
 * ------------------------------------------------------------------------
 * 対象:
 *   - apps/frontend
 *   - React
 *   - Tailwind CSS
 *   - Browser Build
 *
 * ⚠ AI Agent Rule
 * この範囲はフロントエンド専用です。
 * バックエンド関連の修正では変更しないでください。
 * ====================================================================== */

const frontendConfig = {
  root: resolve(import.meta.dirname, "apps/frontend"),

  plugins: [react(), tailwindcss()],

  build: {
    outDir: resolve(import.meta.dirname, "dist/frontend"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
} satisfies UserConfig;

/* ========================================================================
 * Backend Configuration
 * ------------------------------------------------------------------------
 * 対象:
 *   - apps/backend
 *   - Node.js
 *   - Hono
 *   - SSR Bundle
 *
 * ⚠ AI Agent Rule
 * この範囲はバックエンド専用です。
 * フロントエンド関連の修正では変更しないでください。
 * ====================================================================== */

const backendConfig = {
  build: {
    ssr: resolve(import.meta.dirname, "apps/backend/index.ts"),

    outDir: resolve(import.meta.dirname, "dist/backend"),

    emptyOutDir: true,

    target: "node22",

    rollupOptions: {
      external: ["hono", "@hono/node-server", "drizzle-orm", "pg"],

      output: {
        entryFileNames: "index.js",
        format: "es",
      },
    },
  },
} satisfies UserConfig;

/* ========================================================================
 * Export
 * ------------------------------------------------------------------------
 * mode
 *   default  -> frontend
 *   backend  -> backend
 * ====================================================================== */

export default defineConfig(({ mode }) => {
  if (mode === "backend") {
    return backendConfig;
  }

  return frontendConfig;
});
