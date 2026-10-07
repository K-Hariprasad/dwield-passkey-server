export type CredentialStatus = 'active' | 'revoked';

export interface IWebAuthnCredential {
  tenantId: string;
  userId: string;
  credentialId: string; // Base64URL encoded credential ID
  publicKey: Buffer;    // COSE public key binary buffer
  counter: number;
  transports?: string[];
  deviceType?: string;
  backedUp?: boolean;
  friendlyName?: string;
  status: CredentialStatus;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
