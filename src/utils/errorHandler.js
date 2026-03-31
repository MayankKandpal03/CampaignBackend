// App Error handler
export class AppError extends Error {
  constructor(message, statusCode = 500, errors = [], stack = "") {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.success = false;
    this.data = null;
    this.errors = errors;
    this.isOperational = true;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Async Error handler
export const asyncWrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
