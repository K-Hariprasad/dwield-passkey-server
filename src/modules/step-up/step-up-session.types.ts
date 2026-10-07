export type StepUpStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED' | 'CONSUMED';

export interface IStepUpSession {
  stepUpSessionId: string;
  tenantId: string;
  userId: string;
  assessmentId: string;
  ceremonyId?: string;
  status: StepUpStatus;
  createdAt: Date;
  expiresAt: Date;
  verifiedAt?: Date;
  consumedAt?: Date;
  updatedAt: Date;
}

export interface InitiateStepUpSessionInput {
  tenantId: string;
  userId: string;
  assessmentId: string;
}
