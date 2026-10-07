export type ApiKeyType = 'publishable' | 'secret';
export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

export interface IApiKey {
  keyId: string;
  tenantId: string;
  keyHash: string;
  keyType: ApiKeyType;
  status: ApiKeyStatus;
  permissions: string[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
