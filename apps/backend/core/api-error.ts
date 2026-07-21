type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export class ApiError extends Error {
  constructor(
    readonly status: ApiErrorStatus,
    readonly code: string,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class BadRequestError extends ApiError {
  constructor(code: string) {
    super(400, code);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(code: string) {
    super(401, code);
  }
}

export class ForbiddenError extends ApiError {
  constructor(code: string) {
    super(403, code);
  }
}

export class NotFoundError extends ApiError {
  constructor(code: string) {
    super(404, code);
  }
}

export class ConflictError extends ApiError {
  constructor(code: string) {
    super(409, code);
  }
}

export class ValidationError extends ApiError {
  constructor(code: string) {
    super(422, code);
  }
}

export class ServerError extends ApiError {
  constructor(code: string) {
    super(500, code);
  }
}
