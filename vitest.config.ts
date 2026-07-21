import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,

    clearMocks: true,

    restoreMocks: true,

    env: {
      // Router unit tests load the complete app, including repositories that
      // read DATABASE_URL at import time. No test connects to this database.
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/app_test",
    },

    exclude: ["node_modules", "dist"],

    coverage: {
      enabled: false,
    },

    projects: [
      {
        test: {
          name: "frontend",
          include: [
            "apps/frontend/**/*.test.ts",
            "apps/frontend/**/*.test.tsx",
          ],
          environment: "jsdom",
        },
      },
      {
        test: {
          name: "backend",
          include: ["apps/backend/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
