import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  RegistrationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { ITenant } from '../tenants/tenant.types';
import { IUserContext } from '../../types/express';
import { WebAuthnCredential } from '../credentials/credential.model';
import { CeremonySession } from '../ceremonies/ceremony.model';
import { AuditService } from '../audit/audit.service';
import { ValidationError } from '../../shared/errors/app-error';

export interface GenerateRegistrationOptionsInput {
  tenant: ITenant;
  userContext: IUserContext;
  userName?: string;
  userDisplayName?: string;
}

export interface VerifyRegistrationResponseInput {
  tenant: ITenant;
  userContext: IUserContext;
  ceremonyId: string;
  response: RegistrationResponseJSON;
  friendlyName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class RegistrationService {
  /**
   * Generates WebAuthn registration options and persists a single-use challenge.
   */
  public static async generateOptions(input: GenerateRegistrationOptionsInput) {
    const { tenant, userContext, userName, userDisplayName } = input;

    // 1. Fetch user's existing active credentials to populate excludeCredentials
    const existingCredentials = await WebAuthnCredential.find({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      status: 'active',
    });

    const excludeCredentials = existingCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: (cred.transports || []) as AuthenticatorTransportFuture[],
    }));

    // 2. Generate registration options via @simplewebauthn/server
    const options = await generateRegistrationOptions({
      rpName: tenant.name,
      rpID: tenant.rpId,
      userID: Buffer.from(userContext.userId),
      userName: userName || userContext.userId,
      userDisplayName: userDisplayName || userName || userContext.userId,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        userVerification: tenant.userVerificationPolicy,
        residentKey: 'preferred',
      },
    });

    // 3. Persist ceremony session with short expiry (5 minutes)
    const ceremonyId = `cer_reg_${crypto.randomBytes(12).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await CeremonySession.create({
      ceremonyId,
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      ceremonyType: 'registration',
      challenge: options.challenge,
      expectedRpId: tenant.rpId,
      allowedOrigins: tenant.allowedOrigins,
      status: 'pending',
      expiresAt,
    });

    // 4. Record audit event
    await AuditService.record({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      action: 'registration_options_generated',
      details: { ceremonyId, rpId: tenant.rpId },
    });

    return {
      ceremonyId,
      options,
    };
  }

  /**
   * Verifies the authenticator's registration response, persists credential, and consumes challenge.
   */
  public static async verifyResponse(input: VerifyRegistrationResponseInput) {
    const { tenant, userContext, ceremonyId, response, friendlyName, ipAddress, userAgent } = input;

    // 1. Atomically consume the ceremony session
    const ceremony = await CeremonySession.findOneAndUpdate(
      {
        ceremonyId,
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        ceremonyType: 'registration',
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
        action: 'registration_failed',
        details: { ceremonyId, reason: 'Invalid, expired, or already consumed ceremony session' },
        ipAddress,
        userAgent,
      });

      throw new ValidationError('Registration ceremony session is invalid, expired, or already consumed');
    }

    // 2. Verify WebAuthn registration assertion
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: ceremony.challenge,
        expectedOrigin: tenant.allowedOrigins,
        expectedRPID: tenant.rpId,
        requireUserVerification: tenant.userVerificationPolicy === 'required',
      });
    } catch (err) {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'registration_failed',
        details: { ceremonyId, reason: (err as Error).message },
        ipAddress,
        userAgent,
      });

      throw new ValidationError(`WebAuthn registration verification failed: ${(err as Error).message}`);
    }

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo) {
      await AuditService.record({
        tenantId: tenant.tenantId,
        userId: userContext.userId,
        action: 'registration_failed',
        details: { ceremonyId, reason: 'Verification failed' },
        ipAddress,
        userAgent,
      });

      throw new ValidationError('WebAuthn registration response could not be verified');
    }

    // Extract credential details from registrationInfo
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    // Accommodate property variations across simplewebauthn versions
    const credId = credential.id || (credential as unknown as { credentialID: string }).credentialID;
    const publicKeyBytes = credential.publicKey || (credential as unknown as { credentialPublicKey: Uint8Array }).credentialPublicKey;

    const publicKeyBuffer = Buffer.from(publicKeyBytes);

    // 3. Persist verified WebAuthn credential in database
    const savedCredential = await WebAuthnCredential.create({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      credentialId: credId,
      publicKey: publicKeyBuffer,
      counter: credential.counter,
      transports: response.response.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      friendlyName: friendlyName || 'Passkey',
      status: 'active',
    });

    // 4. Record audit event
    await AuditService.record({
      tenantId: tenant.tenantId,
      userId: userContext.userId,
      action: 'registration_verified',
      details: {
        credentialId: credId,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      },
      ipAddress,
      userAgent,
    });

    return {
      verified: true,
      credentialId: savedCredential.credentialId,
      friendlyName: savedCredential.friendlyName,
      createdAt: savedCredential.createdAt,
    };
  }
}
