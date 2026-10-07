export interface IStepUpVerificationTokenPayload {
  jti: string;             // Unique token nonce ID for replay prevention
  iss: string;             // Issuer: "dwield-passkey-server"
  sub: string;             // User ID (subject)
  tenantId: string;        // Tenant ID
  credentialId: string;    // WebAuthn credential ID used
  assessmentId?: string;   // Risk engine assessment ID
  stepUpSessionId?: string;// Step-up session ID
  verifiedAt: string;      // ISO date string of verification
  exp: number;             // Expiry epoch timestamp in seconds
}

export interface VerifyStepUpTokenInput {
  token: string;
  expectedTenantId: string;
  expectedUserId?: string;
  expectedAssessmentId?: string;
  expectedStepUpSessionId?: string;
}

export interface VerifyStepUpTokenResult {
  valid: boolean;
  payload: IStepUpVerificationTokenPayload;
}
