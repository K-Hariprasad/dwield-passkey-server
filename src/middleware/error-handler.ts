import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/app-error';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err }, 'Non-operational AppError occurred');
    } else {
      logger.warn({ errorCode: err.errorCode, message: err.message }, 'Operational AppError');
    }

    res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    logger.warn({ issues: err.issues }, 'Schema validation error');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    logger.warn({ message: err.message }, 'Malformed JSON request body');
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body',
      },
    });
    return;
  }

  // Fallback for unhandled unexpected errors
  logger.error({ err }, 'Unhandled unexpected server error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred',
      ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
};
