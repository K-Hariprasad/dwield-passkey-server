import { Request, Response, NextFunction } from 'express';
import { RegistrationService } from './registration.service';
import {
  generateRegistrationOptionsSchema,
  verifyRegistrationResponseSchema,
} from './registration.schema';
import { UnauthorizedError } from '../../shared/errors/app-error';

export class RegistrationController {
  public static async generateOptions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.tenant || !req.userContext) {
        throw new UnauthorizedError('Tenant or User context missing');
      }

      const body = generateRegistrationOptionsSchema.parse(req.body);

      const result = await RegistrationService.generateOptions({
        tenant: req.tenant,
        userContext: req.userContext,
        userName: body.userName || body.email,
        userDisplayName: body.userDisplayName || body.userName || body.email,
      });

      res.status(200).json({
        status: 'success',
        ceremonyId: result.ceremonyId,
        options: result.options,
        data: {
          ceremonyId: result.ceremonyId,
          options: result.options,
        },
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

      const body = verifyRegistrationResponseSchema.parse(req.body);

      const userAgent = Array.isArray(req.headers['user-agent'])
        ? req.headers['user-agent'][0]
        : req.headers['user-agent'];

      const result = await RegistrationService.verifyResponse({
        tenant: req.tenant,
        userContext: req.userContext,
        ceremonyId: body.ceremonyId,
        response: body.response as any,
        friendlyName: body.friendlyName,
        ipAddress: req.ip,
        userAgent,
      });

      res.status(200).json({
        status: 'success',
        verified: result.verified,
        credentialId: result.credentialId,
        friendlyName: result.friendlyName,
        createdAt: result.createdAt,
        data: {
          verified: result.verified,
          credentialId: result.credentialId,
          friendlyName: result.friendlyName,
          createdAt: result.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
