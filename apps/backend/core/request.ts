import type { Context } from "hono";
import { z } from "zod";

import type { ApiError } from "./api-error";

type ErrorFactory = () => ApiError;

export async function parseJsonBody<T extends z.ZodType>(
  context: Context,
  schema: T,
  createError: ErrorFactory,
): Promise<z.infer<T>> {
  try {
    return schema.parse(await context.req.json());
  } catch {
    throw createError();
  }
}

export function parseUuidParam(
  value: string,
  createError: ErrorFactory,
): string {
  try {
    return z.uuid().parse(value);
  } catch {
    throw createError();
  }
}
