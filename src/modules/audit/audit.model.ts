import { Schema, model, Document } from 'mongoose';
import { IAuditEvent } from './audit.types';

export interface IAuditEventDocument extends Omit<IAuditEvent, 'createdAt'>, Document {
  createdAt: Date;
}

const auditEventSchema = new Schema<IAuditEventDocument>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    userId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const AuditEvent = model<IAuditEventDocument>('AuditEvent', auditEventSchema);
