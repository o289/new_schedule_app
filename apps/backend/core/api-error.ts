import type { ApiErrorCode } from "#contracts/api-error";

type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export class ApiError extends Error {
  constructor(
    readonly status: ApiErrorStatus,
    readonly code: ApiErrorCode,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class BadRequestError extends ApiError {
  constructor(code: ApiErrorCode) {
    super(400, code);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(code: ApiErrorCode) {
    super(401, code);
  }
}

export class ForbiddenError extends ApiError {
  constructor(code: ApiErrorCode) {
    super(403, code);
  }
}

export class NotFoundError extends ApiError {
  constructor(code: ApiErrorCode) {
    super(404, code);
  }
}

export class ConflictError extends ApiError {
  constructor(code: ApiErrorCode) {
    super(409, code);
  }
}

export class AlreadyGroupMemberError extends ConflictError {
  constructor(readonly groupId: string) {
    super("ALREADY_GROUP_MEMBER");
  }
}

export class ValidationError extends ApiError {
  constructor(code: ApiErrorCode) {
    super(422, code);
  }
}

export class ServerError extends ApiError {
  constructor(code: ApiErrorCode) {
    super(500, code);
  }
}
