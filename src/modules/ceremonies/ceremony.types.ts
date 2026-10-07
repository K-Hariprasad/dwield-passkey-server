export type CeremonyType = 'registration' | 'authentication';
export type CeremonyStatus = 'pending' | 'consumed' | 'expired';

export interface ICeremonySession {
  ceremonyId: string;
  tenantId: string;
  userId: string;
  ceremonyType: CeremonyType;
  challenge: string;
  expectedRpId: string;
  allowedOrigins: string[];
  assessmentId?: string;
  stepUpSessionId?: string;
  status: CeremonyStatus;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
