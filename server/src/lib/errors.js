/** An error with an HTTP status that is safe to show the client. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'You do not have access to this record') {
    return new ApiError(403, message);
  }
  /**
   * Used for records that exist but the viewer cannot see, as well as ones
   * that truly do not exist -- distinguishing the two would leak the
   * existence of other breeders' plants.
   */
  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }
  static conflict(message, details) {
    return new ApiError(409, message, details);
  }
}

/** Wraps an async route handler so rejections reach the error middleware. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
