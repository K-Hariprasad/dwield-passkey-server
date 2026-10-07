export type TenantStatus = 'active' | 'suspended' | 'inactive';
export type UserVerificationPolicy = 'required' | 'preferred' | 'discouraged';

export interface ITenant {
  tenantId: string;
  name: string;
  status: TenantStatus;
  rpId: string;
  allowedOrigins: string[];
  userVerificationPolicy: UserVerificationPolicy;
  createdAt: Date;
  updatedAt: Date;
}
