import { Schema, model, Document } from 'mongoose';
import { ICeremonySession } from './ceremony.types';

export interface ICeremonySessionDocument extends Omit<ICeremonySession, 'createdAt' | 'updatedAt'>, Document {
  createdAt: Date;
  updatedAt: Date;
}

const ceremonySessionSchema = new Schema<ICeremonySessionDocument>(
  {
    ceremonyId: {
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
      required: true,
      index: true,
      trim: true,
    },
    ceremonyType: {
      type: String,
      enum: ['registration', 'authentication'],
      required: true,
    },
    challenge: {
      type: String,
      required: true,
    },
    expectedRpId: {
      type: String,
      required: true,
    },
    allowedOrigins: {
      type: [String],
      required: true,
    },
    assessmentId: {
      type: String,
      default: null,
      index: true,
    },
    stepUpSessionId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'consumed', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index: automatically expire documents when expiresAt is reached
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying pending ceremonies for a user and tenant
ceremonySessionSchema.index({ tenantId: 1, userId: 1, ceremonyType: 1, status: 1 });

export const CeremonySession = model<ICeremonySessionDocument>('CeremonySession', ceremonySessionSchema);
