export const apiErrorCodes = [
  "VALIDATION_ERROR",
  "INVALID_REQUEST",
  "INVALID_RESPONSE",
  "INVALID_TIME",
  "SCHEDULE_TIME_OVERLAP",
  "NOT_FOUND_SCHEDULE",
  "NOT_FOUND_CATEGORY",
  "CATEGORY_HAS_SCHEDULES",
  "NOT_FOUND_TODO",
  "FORBIDDEN_SCHEDULE",
  "EMAIL_ALREADY_EXISTS",
  "INVALID_CREDENTIALS",
  "AUTH_INVALID_CHALLENGE",
  "PASSKEY_ALREADY_REGISTERED",
  "PASSKEY_VERIFICATION_FAILED",
  "PASSKEY_NOT_FOUND",
  "USER_NOT_FOUND",
  "INVALID_REFRESH_TOKEN",
  "ALREADY_LOGGED_OUT",
  "HTTP_ERROR",
  "INTERNAL_SERVER_ERROR",
  "SERVER_ERROR",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export interface ApiErrorResponse {
  code: ApiErrorCode;
}

const apiErrorCodeSet = new Set<string>(apiErrorCodes);

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && apiErrorCodeSet.has(value);
}
