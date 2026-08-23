import type { ApiErrorCode } from "#contracts/api-error";

export type ApiClientErrorDetails = {
  groupId: string;
};

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    readonly details?: ApiClientErrorDetails,
  ) {
    super(code);
    this.name = "ApiClientError";
  }
}

export function getApiErrorCode(error: unknown): ApiErrorCode {
  if (error instanceof ApiClientError) return error.code;
  return "SERVER_ERROR";
}
