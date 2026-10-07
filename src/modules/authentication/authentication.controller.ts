import { Request, Response, NextFunction } from 'express';
import { AuthenticationService } from './authentication.service';
import {
  generateAuthenticationOptionsSchema,
  verifyAuthenticationResponseSchema,
} from './authentication.schema';
import { UnauthorizedError } from '../../shared/errors/app-error';

export class AuthenticationController {
  public static async generateOptions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.tenant || !req.userContext) {
        throw new UnauthorizedError('Tenant or User context missing');
      }

      const body = generateAuthenticationOptionsSchema.parse(req.body);

      const result = await AuthenticationService.generateOptions({
        tenant: req.tenant,
        userContext: req.userContext,
        assessmentId: body.assessmentId,
        stepUpSessionId: body.stepUpSessionId,
      });

      res.status(200).json({
        status: 'success',
        ceremonyId: result.ceremonyId,
        options: result.options,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async verifyResponse(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.tenant || !req.userContext) {
        throw new UnauthorizedError('Tenant or User context missing');
      }

      const body = verifyAuthenticationResponseSchema.parse(req.body);

      const userAgent = Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'][0]
        : req.headers['user-agent'];

      const result = await AuthenticationService.verifyResponse({
        tenant: req.tenant,
        userContext: req.userContext,
        ceremonyId: body.ceremonyId,
        response: body.response as any,
        ipAddress: req.ip,
        userAgent,
      });

      res.status(200).json({
        status: 'success',
        verified: result.verified,
        tenantId: result.tenantId,
        userId: result.userId,
        credentialId: result.credentialId,
        assessmentId: result.assessmentId,
        stepUpSessionId: result.stepUpSessionId,
      });
    } catch (error) {
      next(error);
    }
  }
}
