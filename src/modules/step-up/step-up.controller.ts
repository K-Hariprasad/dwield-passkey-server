import { Request, Response, NextFunction } from 'express';
import { StepUpService } from './step-up.service';
import { initiateStepUpSessionSchema, verifyStepUpTokenSchema } from './step-up.schema';
import { UnauthorizedError } from '../../shared/errors/app-error';

export class StepUpController {
  public static async initiateSession(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.tenant) {
        throw new UnauthorizedError('Tenant context missing');
      }
      if (!req.userContext) {
        throw new UnauthorizedError('User context missing');
      }

      const body = initiateStepUpSessionSchema.parse(req.body);

      const session = await StepUpService.initiateSession({
        tenantId: req.tenant.tenantId,
        userId: req.userContext.userId,
        assessmentId: body.assessmentId,
      });

      res.status(201).json({
        status: 'success',
        session,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async verifyToken(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.tenant) {
        throw new UnauthorizedError('Tenant context missing');
      }

      const body = verifyStepUpTokenSchema.parse(req.body);

      const result = await StepUpService.verifyStepUpToken(
        {
          token: body.token,
          expectedTenantId: req.tenant.tenantId,
          expectedUserId: body.expectedUserId,
          expectedAssessmentId: body.expectedAssessmentId,
          expectedStepUpSessionId: body.expectedStepUpSessionId,
        },
        process.env.TENANT_SECRET || 'dev-tenant-secret'
      );

      res.status(200).json({
        status: 'success',
        valid: result.valid,
        payload: result.payload,
      });
    } catch (error) {
      next(error);
    }
  }
}

