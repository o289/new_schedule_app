# スケジュール管理アプリ(typescript版)

## 目的

AI開発にあたり、2言語を使った開発による、調整コストを減らす。以下のような現象が起きていた

- 2箇所に型
- フォーマッターもPrettierとblockFormatterを併用

## 使用技術

typescriptによる変更が必要なもの以外は、同じものを使用する

言語: typescript
バックエンド: Hono, Drizzle ORM, zod
フロントエンド: React, MUI, tailwindcss
データベース: pg
テスト: vitest
ツール: Docker
