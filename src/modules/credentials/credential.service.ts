import { WebAuthnCredential } from './credential.model';
import { AuditService } from '../audit/audit.service';
import { NotFoundError, ForbiddenError } from '../../shared/errors/app-error';

export class CredentialService {
  /**
   * Lists registered passkey credentials for a user within a tenant.
   */
  public static async listCredentials(tenantId: string, userId: string) {
    const credentials = await WebAuthnCredential.find({
      tenantId,
      userId,
      status: 'active',
    }).sort({ createdAt: -1 });

    return credentials.map((cred) => ({
      credentialId: cred.credentialId,
      friendlyName: cred.friendlyName,
      deviceType: cred.deviceType,
      backedUp: cred.backedUp,
      transports: cred.transports,
      createdAt: cred.createdAt,
      lastUsedAt: cred.lastUsedAt,
      status: cred.status,
    }));
  }

  /**
   * Revokes a passkey credential, checking tenant and user ownership.
   */
  public static async revokeCredential(
    tenantId: string,
    userId: string,
    credentialId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const credentialDoc = await WebAuthnCredential.findOne({
      tenantId,
      credentialId,
    });

    if (!credentialDoc) {
      throw new NotFoundError(`Passkey credential with ID '${credentialId}' not found`);
    }

    if (credentialDoc.userId !== userId) {
      throw new ForbiddenError('You do not have permission to manage this passkey credential');
    }

    if (credentialDoc.status === 'revoked') {
      return {
        success: true,
        message: 'Credential is already revoked',
        credentialId,
      };
    }

    await WebAuthnCredential.updateOne(
      { _id: credentialDoc._id },
      {
        $set: {
          status: 'revoked',
          revokedAt: new Date(),
        },
      }
    );

    await AuditService.record({
      tenantId,
      userId,
      action: 'credential_revoked',
      details: { credentialId },
      ipAddress,
      userAgent,
    });

    return {
      success: true,
      message: 'Passkey credential revoked successfully',
      credentialId,
    };
  }
}
