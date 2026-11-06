/**
 * Global Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.url}:`, err.message || err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || undefined,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;

