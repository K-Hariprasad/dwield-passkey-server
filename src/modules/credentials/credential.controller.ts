import { Request, Response, NextFunction } from 'express';
import { CredentialService } from './credential.service';
import { UnauthorizedError, ValidationError } from '../../shared/errors/app-error';

export class CredentialController {
  public static async listCredentials(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.tenant || !req.userContext) {
        throw new UnauthorizedError('Tenant or User context missing');
      }

      const credentials = await CredentialService.listCredentials(
        req.tenant.tenantId,
        req.userContext.userId
      );

      res.status(200).json({
        status: 'success',
        credentials,
        data: credentials,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async revokeCredential(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.tenant || !req.userContext) {
        throw new UnauthorizedError('Tenant or User context missing');
      }

      const credentialId = req.params.credentialId as string;

      if (!credentialId) {
        throw new ValidationError('credentialId route parameter is required');
      }

      const userAgent = Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'][0]
        : req.headers['user-agent'];

      const result = await CredentialService.revokeCredential(
        req.tenant.tenantId,
        req.userContext.userId,
        credentialId,
        req.ip,
        userAgent
      );

      res.status(200).json({
        status: 'success',
        ...result,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
