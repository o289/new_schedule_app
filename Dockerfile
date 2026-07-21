# ホットリロードを優先した構成
FROM node:22-alpine AS development

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app
