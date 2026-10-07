import crypto from 'crypto';
import { AuditEvent } from './audit.model';
import { AuditAction } from './audit.types';
import { logger } from '../../config/logger';

export interface RecordAuditInput {
  tenantId: string;
  userId?: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  /**
   * Records a security-relevant audit event.
   * Strips out any accidental secrets before writing.
   */
  public static async record(input: RecordAuditInput): Promise<void> {
    try {
      const eventId = `evt_${crypto.randomBytes(12).toString('hex')}`;

      // Sanitize details object to ensure no private keys or secrets are logged
      const sanitizedDetails = input.details ? this.sanitizeDetails(input.details) : {};

      await AuditEvent.create({
        eventId,
        tenantId: input.tenantId,
        userId: input.userId || null,
        action: input.action,
        details: sanitizedDetails,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
      });

      logger.info(
        { eventId, tenantId: input.tenantId, userId: input.userId, action: input.action },
        'Security audit event recorded'
      );
    } catch (error) {
      logger.error({ err: error, action: input.action }, 'Failed to record audit event');
    }
  }

  private static sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
    const forbiddenKeys = ['privatekey', 'secret', 'password', 'token', 'rawapikey'];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(details)) {
      if (forbiddenKeys.some((fk) => key.toLowerCase().includes(fk))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
