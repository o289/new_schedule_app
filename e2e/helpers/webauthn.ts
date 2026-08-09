import { randomUUID } from "node:crypto";

import type { BrowserContext } from "@playwright/test";

export function createE2EEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@e2e.test`;
}

export async function installVirtualAuthenticator(
  context: BrowserContext,
): Promise<void> {
  await context.credentials.install();
}

export async function virtualCredentialCount(
  context: BrowserContext,
  rpId: string,
): Promise<number> {
  return (await context.credentials.get({ rpId })).length;
}
