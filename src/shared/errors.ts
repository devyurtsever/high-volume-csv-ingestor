export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown, code = 'BAD_REQUEST') {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown, code = 'UNAUTHORIZED') {
    super(401, code, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown, code = 'FORBIDDEN') {
    super(403, code, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown, code = 'NOT_FOUND') {
    super(404, code, message, details);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload too large', details?: unknown, code = 'PAYLOAD_TOO_LARGE') {
    super(413, code, message, details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable entity', details?: unknown, code = 'UNPROCESSABLE_ENTITY') {
    super(422, code, message, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', details?: unknown, code = 'SERVICE_UNAVAILABLE') {
    super(503, code, message, details);
  }
}
