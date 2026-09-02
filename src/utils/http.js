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
  const message = err.message || 'Internal server error';
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, error: message, details: err.details });
}