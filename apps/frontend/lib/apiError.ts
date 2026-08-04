import type { ApiErrorCode } from "../../../packages/contracts/api-error";

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "ApiClientError";
  }
}

export function getApiErrorCode(error: unknown): ApiErrorCode {
  if (error instanceof ApiClientError) return error.code;
  return "SERVER_ERROR";
}
