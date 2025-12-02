/**
 * Centralized Error Handler Middleware
 * Handles all errors thrown in routes and provides consistent error responses
 */

class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  let error = err;

  // Handle Mongoose/Database errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(e => e.message).join(', ');
    error = new AppError(message, 400, 'VALIDATION_ERROR', err.errors);
  }

  // Handle PostgreSQL errors
  if (err.code && err.code.startsWith('23')) {
    if (err.code === '23505') {
      error = new AppError('Duplicate entry', 409, 'DUPLICATE_ENTRY', {
        field: err.detail
      });
    } else if (err.code === '23503') {
      error = new AppError('Foreign key constraint violation', 400, 'CONSTRAINT_VIOLATION');
    } else if (err.code === '23502') {
      error = new AppError('Required field missing', 400, 'REQUIRED_FIELD');
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token expired', 401, 'TOKEN_EXPIRED');
  }

  // Handle express-validator errors
  if (err.array && typeof err.array === 'function') {
    const errors = err.array();
    error = new AppError(
      'Validation failed',
      400,
      'VALIDATION_ERROR',
      errors
    );
  }

  const statusCode = error.statusCode || 500;
  const message = error.isOperational 
    ? error.message 
    : 'Internal server error';

  // Log error for debugging
  if (statusCode === 500) {
    console.error('❌ Server Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      body: req.body,
      params: req.params,
      query: req.query,
      user: req.user?.id
    });
  } else {
    console.warn('⚠️ Client Error:', {
      code: error.code,
      message: message,
      url: req.originalUrl,
      method: req.method,
      statusCode
    });
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: error.code || 'UNKNOWN_ERROR',
      statusCode,
      ...(error.details && { details: error.details }),
      ...(process.env.NODE_ENV === 'development' && statusCode === 500 && {
        stack: err.stack
      })
    }
  });
}

/**
 * 404 Not Found Handler
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
