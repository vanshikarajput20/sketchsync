/**
 * server/src/middleware/errorHandler.js
 *
 * Express error-handling middleware (must have 4 parameters).
 * Catches any error passed via next(err) and returns a consistent JSON response.
 */

/**
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

  if (status >= 500) {
    console.error('[HTTP Error]', err);
  }

  res.status(status).json({ error: message });
}
