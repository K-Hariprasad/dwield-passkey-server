export type AuditAction =
  | 'registration_options_generated'
  | 'registration_verified'
  | 'registration_failed'
  | 'authentication_options_generated'
  | 'authentication_verified'
  | 'authentication_failed'
  | 'credential_revoked'
  | 'rate_limit_exceeded';

export interface IAuditEvent {
  eventId: string;
  tenantId: string;
  userId?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}
