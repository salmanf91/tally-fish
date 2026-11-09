/**
 * Global Error Handling Middleware
 * Policy 9 — Information Leakage Prevention
 */
function errorHandler(err, req, res, next) {
  // Server-side logging only
  console.error(`[Error] ${req.method} ${req.url}:`, err.message || err);

  const statusCode = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';

  // Mask 500 errors to prevent leaking internal database schemas or file paths to clients
  const message =
    statusCode === 500 && !isDev
      ? 'An unexpected error occurred. Please try again later.'
      : err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || undefined,
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = errorHandler;
