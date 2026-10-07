import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/app-error';

export const requirePermission = (permission: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.apiKey) {
        throw new UnauthorizedError('API key context missing');
      }

      const permissions = req.apiKey.permissions || [];
      if (!permissions.includes(permission) && !permissions.includes('*')) {
        throw new ForbiddenError(`API key lacks required permission: '${permission}'`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
