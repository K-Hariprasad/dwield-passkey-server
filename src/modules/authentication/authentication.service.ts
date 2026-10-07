import crypto from 'crypto';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { ITenant } from '../tenants/tenant.types';
import { IUserContext } from '../../types/express';
import { WebAuthnCredential } from '../credentials/credential.model';
import { CeremonySession } from '../ceremonies/ceremony.model';
import { AuditService } from '../audit/audit.service';
import { StepUpService } from '../step-up/step-up.service';
import { StepUpSession } from '../step-up/step-up-session.model';
import { ValidationError, NotFoundError, UnauthorizedError, ForbiddenError } from '../../shared/errors/app-error';

export interface GenerateAuthenticationOptionsInput {
  tenant: ITenant;
  userContext: IUserContext;
  assessmentId?: string;
  stepUpSessionId?: string;
}

export interface VerifyAuthenticationResponseInput {
  tenant: ITenant;
  userContext: IUserContext;
  ceremonyId: string;
  response: AuthenticationResponseJSON;
  ipAddress?: string;
  userAgent?: string;
}

export class AuthenticationService {
  /**
   * Generates WebAuthn authentication options for user passkeys.
   */
  public static async generateOptions(input: GenerateAuthenticationOptionsInput) {
    const { tenant, userContext, assessmentId, stepUpSessionId } = input;

    // Validate step-up session binding if provided
    if (stepUpSessionId) {
      const stepUpSession = await StepUpSession.findOne({
        stepUpSessionId,
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        status: 'PENDING',
        expiresAt: { $gt: new Date() },
      });

      if (!stepUpSession) {
        throw new ValidationError('Step-up session is invalid, expired, or non-pending');
      }

      if (assessmentId && stepUpSession.assessmentId !== assessmentId) {
        throw new ValidationError('Assessment ID does not match the bound step-up session');
      }
    }

    // 1. Retrieve user's active credentials for this tenant
    const activeCredentials = await WebAuthnCredential.find({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      status: 'active',
    });

    if (activeCredentials.length === 0) {
      throw new NotFoundError('No active passkeys registered for this user account');
    }

    const allowCredentials = activeCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: (cred.transports || []) as AuthenticatorTransportFuture[],
    }));

    // 2. Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID: tenant.rpId,
      allowCredentials,
      userVerification: tenant.userVerificationPolicy,
    });

    // 3. Persist ceremony session with 5-minute expiry
    const ceremonyId = `cer_auth_${crypto.randomBytes(12).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await CeremonySession.create({
      ceremonyId,
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      ceremonyType: 'authentication',
      challenge: options.challenge,
      expectedRpId: tenant.rpId,
      allowedOrigins: tenant.allowedOrigins,
      assessmentId: assessmentId || null,
      stepUpSessionId: stepUpSessionId || null,
      status: 'pending',
      expiresAt,
    });

    // 4. Record audit event
    await AuditService.record({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      action: 'authentication_options_generated',
      details: { ceremonyId, rpId: tenant.rpId, assessmentId, stepUpSessionId },
    });

    return {
      ceremonyId,
      options,
    };
  }

  /**
   * Verifies WebAuthn authentication assertion response.
   */
  public static async verifyResponse(input: VerifyAuthenticationResponseInput) {
    const { tenant, userContext, ceremonyId, response, ipAddress, userAgent } = input;

    // 1. Atomically consume the ceremony session
    const ceremony = await CeremonySession.findOneAndUpdate(
      {
        ceremonyId,
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        ceremonyType: 'authentication',
        status: 'pending',
        expiresAt: { $gt: new Date() },
      },
      {
        $set: { status: 'consumed', consumedAt: new Date() },
      },
      { new: true }
    );

    if (!ceremony) {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'authentication_failed',
        details: { ceremonyId, reason: 'Invalid, expired, or already consumed ceremony session' },
        ipAddress,
        userAgent,
      });

      throw new ValidationError('Authentication ceremony session is invalid, expired, or already consumed');
    }

    // 2. Lookup matching credential record
    const credentialDoc = await WebAuthnCredential.findOne({
      tenantId: tenant.tenantId,
      credentialId: response.id,
    });

    if (!credentialDoc) {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'authentication_failed',
        details: { ceremonyId, credentialId: response.id, reason: 'Credential not found' },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedError('Passkey credential not found');
    }

    if (credentialDoc.status !== 'active') {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'authentication_failed',
        details: { ceremonyId, credentialId: response.id, reason: 'Credential is revoked' },
        ipAddress,
        userAgent,
      });

      throw new UnauthorizedError('Passkey credential has been revoked');
    }

    if (credentialDoc.userId !== userContext.userId) {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'authentication_failed',
        details: { ceremonyId, credentialId: response.id, reason: 'Credential ownership mismatch' },
        ipAddress,
        userAgent,
      });

      throw new ForbiddenError('Passkey credential does not belong to the authenticated user');
    }

    // 3. Verify assertion with @simplewebauthn/server
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: ceremony.challenge,
        expectedOrigin: tenant.allowedOrigins,
        expectedRPID: tenant.rpId,
        credential: {
          id: credentialDoc.credentialId,
          publicKey: new Uint8Array(credentialDoc.publicKey),
          counter: credentialDoc.counter,
          transports: (credentialDoc.transports || []) as AuthenticatorTransportFuture[],
        },
        requireUserVerification: tenant.userVerificationPolicy === 'required',
      });
    } catch (err) {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'authentication_failed',
        details: { ceremonyId, credentialId: response.id, reason: (err as Error).message },
        ipAddress,
        userAgent,
      });

      throw new ValidationError(`WebAuthn assertion verification failed: ${(err as Error).message}`);
    }

    const { verified, authenticationInfo } = verification;

    if (!verified || !authenticationInfo) {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'authentication_failed',
        details: { ceremonyId, credentialId: response.id, reason: 'Assertion verification failed' },
        ipAddress,
        userAgent,
      });

      throw new ValidationError('WebAuthn assertion response could not be verified');
    }

    // 4. Update credential counter and lastUsedAt timestamp
    const newCounter = authenticationInfo.newCounter;
    await WebAuthnCredential.updateOne(
      { _id: credentialDoc._id },
      {
        $set: {
          counter: newCounter,
          lastUsedAt: new Date(),
        },
      }
    );

    // 5. Record successful audit event
    await AuditService.record({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      action: 'authentication_verified',
      details: {
        ceremonyId,
        credentialId: credentialDoc.credentialId,
        assessmentId: ceremony.assessmentId,
        stepUpSessionId: ceremony.stepUpSessionId,
        newCounter,
      },
      ipAddress,
      userAgent,
    });

    // 6. Transition step-up session status to VERIFIED if bound
    if (ceremony.stepUpSessionId) {
      await StepUpService.markSessionVerified(ceremony.stepUpSessionId, ceremonyId);
    }

    // 7. Generate cryptographically signed Step-Up Verification Token
    const stepUpToken = StepUpService.generateStepUpToken({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      credentialId: credentialDoc.credentialId,
      assessmentId: ceremony.assessmentId || undefined,
      stepUpSessionId: ceremony.stepUpSessionId || undefined,
    });

    return {
      verified: true,
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      credentialId: credentialDoc.credentialId,
      assessmentId: ceremony.assessmentId || undefined,
      stepUpSessionId: ceremony.stepUpSessionId || undefined,
      stepUpToken,
    };
  }
}
