import crypto from 'crypto';
import {
  IStepUpVerificationTokenPayload,
  VerifyStepUpTokenInput,
  VerifyStepUpTokenResult,
} from './step-up.types';
import { StepUpSession } from './step-up-session.model';
import { InitiateStepUpSessionInput } from './step-up-session.types';
import { ConsumedStepUpToken } from './consumed-token.model';
import { SpringBootRiskEngineAdapter } from '../risk-engine/risk-engine.adapter';
import { ValidationError, UnauthorizedError, ConflictError, ForbiddenError } from '../../shared/errors/app-error';
import { safeCompare } from '../../shared/utils/crypto';
import { logger } from '../../config/logger';

export interface CreateStepUpTokenInput {
  tenantId: string;
  userId: string;
  credentialId: string;
  assessmentId?: string;
  stepUpSessionId?: string;
  tenantSecret?: string;
  ttlSeconds?: number;
}

export class StepUpService {
  private static DEFAULT_ISSUER = 'dwield-passkey-server';

  /**
   * Initiates a new step-up authentication session bound to tenant, user, and risk assessment.
   */
  public static async initiateSession(input: InitiateStepUpSessionInput) {
    const { tenantId, userId, assessmentId } = input;

    // Validate risk assessment context via Spring Boot Risk Engine Adapter
    const riskAdapter = new SpringBootRiskEngineAdapter();
    const assessmentResult = await riskAdapter.getAssessmentResult(assessmentId);

    if (assessmentResult && assessmentResult.decision === 'DENY') {
      logger.warn({ tenantId, userId, assessmentId }, 'Attempted step-up initiation for DENY risk assessment');
      throw new ForbiddenError('Step-up authentication is not permitted for DENY risk decisions');
    }

    const stepUpSessionId = `step_sess_${crypto.randomBytes(12).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

    const session = await StepUpSession.create({
      stepUpSessionId,
      tenantId,
      userId,
      assessmentId,
      status: 'PENDING',
      expiresAt,
    });

    logger.info({ stepUpSessionId, tenantId, userId, assessmentId }, 'Step-up authentication session initiated');

    return {
      stepUpSessionId: session.stepUpSessionId,
      tenantId: session.tenantId,
      userId: session.userId,
      assessmentId: session.assessmentId,
      status: session.status,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Transitions a PENDING step-up session to VERIFIED upon successful passkey verification.
   */
  public static async markSessionVerified(stepUpSessionId: string, ceremonyId: string) {
    const session = await StepUpSession.findOneAndUpdate(
      {
        stepUpSessionId,
        status: 'PENDING',
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: 'VERIFIED',
          ceremonyId,
          verifiedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!session) {
      logger.warn({ stepUpSessionId }, 'Failed to mark step-up session verified: session invalid or expired');
    }

    return session;
  }

  /**
   * Transitions a PENDING step-up session to FAILED upon failed passkey assertion.
   */
  public static async markSessionFailed(stepUpSessionId: string) {
    const session = await StepUpSession.findOneAndUpdate(
      {
        stepUpSessionId,
        status: 'PENDING',
      },
      {
        $set: {
          status: 'FAILED',
        },
      },
      { new: true }
    );
    return session;
  }

  /**
   * Generates a signed, short-lived Step-Up Verification Token.
   */
  public static generateStepUpToken(input: CreateStepUpTokenInput): string {
    const {
      tenantId,
      userId,
      credentialId,
      assessmentId,
      stepUpSessionId,
      tenantSecret = process.env.TENANT_SECRET || 'dev-tenant-secret',
      ttlSeconds = 300, // 5 minutes default
    } = input;

    const jti = `stk_${crypto.randomBytes(16).toString('hex')}`;
    const nowEpoch = Math.floor(Date.now() / 1000);
    const expEpoch = nowEpoch + ttlSeconds;

    const payload: IStepUpVerificationTokenPayload = {
      jti,
      iss: this.DEFAULT_ISSUER,
      sub: userId,
      tenantId,
      credentialId,
      assessmentId: assessmentId || undefined,
      stepUpSessionId: stepUpSessionId || undefined,
      verifiedAt: new Date().toISOString(),
      exp: expEpoch,
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', tenantSecret)
      .update(payloadBase64)
      .digest('base64url');

    return `${payloadBase64}.${signature}`;
  }

  /**
   * Verifies a Step-Up Verification Token, checking signature, expiry, binding constraints, and replay prevention.
   */
  public static async verifyStepUpToken(
    input: VerifyStepUpTokenInput,
    tenantSecret: string = process.env.TENANT_SECRET || 'dev-tenant-secret'
  ): Promise<VerifyStepUpTokenResult> {
    const { token, expectedTenantId, expectedUserId, expectedAssessmentId, expectedStepUpSessionId } = input;

    if (!token || typeof token !== 'string') {
      throw new ValidationError('Step-up verification token is required');
    }

    const parts = token.trim().split('.');
    if (parts.length !== 2) {
      throw new ValidationError('Invalid step-up token format. Expected <payloadBase64>.<signature>');
    }

    const [payloadBase64, signature] = parts;

    // 1. Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', tenantSecret)
      .update(payloadBase64)
      .digest('base64url');

    if (!safeCompare(signature, expectedSignature)) {
      logger.warn({ tokenPrefix: payloadBase64.substring(0, 10) }, 'Step-up token signature verification failed');
      throw new UnauthorizedError('Invalid step-up verification token signature');
    }

    // 2. Decode payload
    let payload: IStepUpVerificationTokenPayload;
    try {
      const decodedJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
      payload = JSON.parse(decodedJson);
    } catch {
      throw new ValidationError('Step-up token payload is not valid JSON');
    }

    // 3. Expiry check
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (payload.exp < nowEpoch) {
      throw new UnauthorizedError('Step-up verification token has expired');
    }

    // 4. Validate binding attributes
    if (payload.tenantId !== expectedTenantId) {
      throw new UnauthorizedError(
        `Step-up token tenant mismatch. Expected '${expectedTenantId}', got '${payload.tenantId}'`
      );
    }

    if (expectedUserId && payload.sub !== expectedUserId) {
      throw new UnauthorizedError(
        `Step-up token user mismatch. Expected '${expectedUserId}', got '${payload.sub}'`
      );
    }

    if (expectedAssessmentId && payload.assessmentId !== expectedAssessmentId) {
      throw new UnauthorizedError(
        `Step-up token assessment mismatch. Expected '${expectedAssessmentId}', got '${payload.assessmentId}'`
      );
    }

    if (expectedStepUpSessionId && payload.stepUpSessionId !== expectedStepUpSessionId) {
      throw new UnauthorizedError(
        `Step-up token session mismatch. Expected '${expectedStepUpSessionId}', got '${payload.stepUpSessionId}'`
      );
    }

    // 5. Atomic replay prevention & StepUpSession state update
    try {
      await ConsumedStepUpToken.create({
        jti: payload.jti,
        tenantId: payload.tenantId,
        userId: payload.sub,
        assessmentId: payload.assessmentId || null,
        consumedAt: new Date(),
        expiresAt: new Date(payload.exp * 1000),
      });

      if (payload.stepUpSessionId) {
        await StepUpSession.updateOne(
          { stepUpSessionId: payload.stepUpSessionId, status: 'VERIFIED' },
          { $set: { status: 'CONSUMED', consumedAt: new Date() } }
        );
      }
    } catch (err: any) {
      if (err.code === 11000 || err.name === 'MongoServerError') {
        logger.warn({ jti: payload.jti, tenantId: payload.tenantId }, 'Replay attempt detected for step-up token');
        throw new ConflictError('Step-up verification token has already been consumed (replay attempt detected)');
      }
      throw err;
    }

    return {
      valid: true,
      payload,
    };
  }
}
