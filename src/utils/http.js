export function ok(res, data, meta) {
  res.json({ success: true, data, meta });
}

export function created(res, data) {
  res.status(201).json({ success: true, data });
}

export function fail(res, status, message, details) {
  res.status(status).json({ success: false, error: message, details });
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(req, res, next) {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`));
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  // Never echo an unexpected error's message to the client: it leaks internal
  // paths, stack detail and validation schemas. Unexpected errors are logged
  // server-side and reported generically. ApiError messages are authored here
  // and are safe to return.
  const message = err.status ? err.message : 'Internal server error';
  res.status(status).json({ success: false, error: message, details: err.details });
}