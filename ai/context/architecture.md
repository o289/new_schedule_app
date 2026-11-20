#　アーキテクチャ

## 前提

## 採用した技術

ESLintのみtypescript7.1になるまで、導入を見送る

言語: typescript
バックエンド: Hono, Drizzle
フロントエンド: React, MUI, tailwindcss
データベース: pg
フレームワーク: zod, fullcalendar
テスト: vitest
ツール: Docker

---

## フォルダ構成

### プロジェクトルート

project_root/
├── apps ← アプリケーションコード(純粋なソースコード)
├── packages ← 共通処理
├── package.json
├── tsconfig.base.json
├── tsconfig.backend.json
├── tsconfig.frontend.json
├── tsconfig.tools.json
├── vite.config.ts
├── vitest.config.ts

**開発ツール設定ファイルは必ずプロジェクトルートにおく**

### パッケージルート

packages/
├── schemas ← Zodスキーマと型（最重要）
├── utils ← 日付や共通関数
└── config ← 定数や設定ファイルを入れる

**フロントでもバックエンドでも動くコードだけ置く**

### アプリケーションルート

apps/
├── frontend
├── backend

### バックエンドディレクトリ

backend/
├── index.ts
├── category
├── schedule
├── passkey

**servece.tsなどと役割をファイル名とするい**

### フロントエンドディレクトリ

frontend/
├── App.tsx
├── category
├── schedule
├── passkey

**Page.tsxを最終的な親にする構想**

---

## package.json

```json
{
  "name": "new_schedule_app",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.13.0",
  "engines": {
    "node": ">=22.12 <23"
  },
  "imports": {
    "#config/*": "./packages/config/*",
    "#contracts/*": "./packages/contracts/*",
    "#schemas/*": "./packages/schemas/*",
    "#utils/*": "./packages/utils/*"
  },
  "scripts": {
    "dev": "concurrently -n frontend,backend \"pnpm dev:frontend\" \"pnpm dev:backend\"",
    "dev:frontend": "vite --config vite.config.ts",
    "dev:backend": "tsx watch apps/backend/index.ts",

    "build": "pnpm typecheck && pnpm build:frontend && pnpm build:backend",
    "build:frontend": "vite build --config vite.config.ts",
    "build:backend": "vite build --config vite.config.ts --mode backend",

    "typecheck": "pnpm typecheck:frontend && pnpm typecheck:backend && pnpm typecheck:tools",
    "typecheck:frontend": "tsc -p tsconfig.frontend.json --noEmit",
    "typecheck:backend": "tsc -p tsconfig.backend.json --noEmit",
    "typecheck:tools": "tsc -p tsconfig.tools.json --noEmit",

    "test": "vitest run",
    "test:watch": "vitest",
    "test:frontend": "vitest run --project frontend",
    "test:backend": "vitest run --project backend",

    "format": "prettier --write .",
    "format:check": "prettier --check .",

    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@emotion/react": "<固定バージョン>",
    "@emotion/styled": "<固定バージョン>",
    "@hono/node-server": "<固定バージョン>",
    "@mui/icons-material": "<固定バージョン>",
    "@mui/material": "<固定バージョン>",
    "drizzle-orm": "<固定バージョン>",
    "hono": "<固定バージョン>",
    "pg": "<固定バージョン>",
    "react": "<固定バージョン>",
    "react-dom": "<固定バージョン>",
    "zod": "<固定バージョン>",
    "@fullcalendar/core": "<固定バージョン>",
    "@fullcalendar/daygrid": "<固定バージョン>",
    "@fullcalendar/interaction": "<固定バージョン>",
    "@fullcalendar/react": "<固定バージョン>",
    "@fullcalendar/timegrid": "<固定バージョン>",
    "@mui/x-date-pickers": "<固定バージョン>",
    "react-router-dom": "<固定バージョン>",
    "clsx": "<固定バージョン>",
    "dayjs": "<固定バージョン>"
  },
  "devDependencies": {
    "@tailwindcss/vite": "<固定バージョン>",
    "@types/node": "<固定バージョン>",
    "@types/pg": "<固定バージョン>",
    "@types/react": "<固定バージョン>",
    "@types/react-dom": "<固定バージョン>",
    "@vitejs/plugin-react": "<固定バージョン>",
    "concurrently": "<固定バージョン>",
    "drizzle-kit": "<固定バージョン>",
    "jsdom": "<固定バージョン>",
    "prettier": "<固定バージョン>",
    "tailwindcss": "<固定バージョン>",
    "tsx": "<固定バージョン>",
    "typescript": "<TypeScript 7の固定バージョン>",
    "vite": "<固定バージョン>",
    "vitest": "<固定バージョン>"
  }
}
```

バックエンドの実行方式
開発時
tsx watchで直接TypeScript実行

本番
Viteでbundleしたdist/backend/index.jsをNode.jsで実行

---

## tsconfig

### 共通

```json
{
  "compilerOptions": {
    "target": "ES2022",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,

    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",

    "skipLibCheck": false,
    "forceConsistentCasingInFileNames": true
  }
}
```

### フロントエンド

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",

    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",

    "resolveJsonModule": true,

    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": [
    "apps/frontend/**/*.ts",
    "apps/frontend/**/*.tsx",
    "packages/**/*.ts"
  ],
  "exclude": ["node_modules", "dist", "apps/backend"]
}
```

### バックエンド

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",

    "lib": ["ES2022"],
    "types": ["node"],

    "noEmit": true,
    "tsBuildInfoFile": "./node_modules/.cache/tsconfig.backend.tsbuildinfo"
  },
  "include": ["apps/backend/**/*.ts", "packages/**/*.ts"],
  "exclude": ["node_modules", "dist", "apps/frontend"]
}
```

### ツール

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",

    "lib": ["ES2022"],
    "types": ["node"],

    "noEmit": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "drizzle.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Vite、Vitest、Drizzleなどの設定ファイル用です。

---

## vite.config.ts

```ts
import { defineConfig } from "vite";
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
};

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
};

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
```

## vitest.config.ts

```ts
export default defineConfig({
  test: {
    globals: true,

    clearMocks: true,

    restoreMocks: true,

    include: ["apps/**/*.test.ts", "apps/**/*.test.tsx"],

    exclude: ["node_modules", "dist"],

    coverage: {
      enabled: false,
    },

    projects: [
      {
        test: {
          name: "frontend",
          environment: "jsdom",
        },
      },
      {
        test: {
          name: "backend",
          environment: "node",
        },
      },
    ],
  },
});
```
