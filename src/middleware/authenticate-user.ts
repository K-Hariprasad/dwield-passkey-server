import { Request, Response, NextFunction } from 'express';
import { UserContextService } from '../modules/identity/user-context.service';
import { UnauthorizedError } from '../shared/errors/app-error';

export const authenticateUser = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userToken = req.headers['x-dwield-user-token'] as string | undefined;
    const userEmail = (
      req.body?.email ||
      req.body?.userName ||
      req.body?.userId ||
      req.headers['x-user-email'] ||
      req.headers['x-user-id']
    ) as string | undefined;

    if (userToken) {
      const { userContext } = UserContextService.parseAndValidateToken(userToken, {
        expectedTenantId: req.tenant?.tenantId,
        tenantSecret: process.env.TENANT_SECRET || 'dev-tenant-secret',
      });
      req.userContext = userContext;
      return next();
    }

    if (userEmail && typeof userEmail === 'string' && userEmail.trim()) {
      req.userContext = {
        userId: userEmail.trim(),
        tenantId: req.tenant?.tenantId || 'tenant_dev_123',
        authenticatedAt: new Date(),
        authMethod: 'email_direct',
      };
      return next();
    }

    // Auto-resolve userContext from ceremonySession if ceremonyId is passed in body
    if (req.body?.ceremonyId && typeof req.body.ceremonyId === 'string') {
      const { CeremonySession } = await import('../modules/ceremonies/ceremony.model');
      const ceremony = await CeremonySession.findOne({ ceremonyId: req.body.ceremonyId });
      if (ceremony) {
        req.userContext = {
          userId: ceremony.userId,
          tenantId: ceremony.tenantId,
          authenticatedAt: new Date(),
          authMethod: 'ceremony_session',
        };
        return next();
      }
    }

    throw new UnauthorizedError(
      'User identity context token is missing (expected X-Dwield-User-Token header or email/userId in body)'
    );
  } catch (error) {
    next(error);
  }
};
