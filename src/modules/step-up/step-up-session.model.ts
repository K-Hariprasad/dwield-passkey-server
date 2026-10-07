import { Schema, model, Document } from 'mongoose';
import { IStepUpSession } from './step-up-session.types';

export interface IStepUpSessionDocument extends Omit<IStepUpSession, 'createdAt' | 'updatedAt'>, Document {
  createdAt: Date;
  updatedAt: Date;
}

const stepUpSessionSchema = new Schema<IStepUpSessionDocument>(
  {
    stepUpSessionId: {
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
    assessmentId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    ceremonyId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'EXPIRED', 'FAILED', 'CONSUMED'],
      default: 'PENDING',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index for automatic cleanup of expired step-up sessions
    },
    verifiedAt: {
      type: Date,
      default: null,
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

// Compound index for querying pending step-up sessions for a tenant and user
stepUpSessionSchema.index({ tenantId: 1, userId: 1, assessmentId: 1, status: 1 });

export const StepUpSession = model<IStepUpSessionDocument>('StepUpSession', stepUpSessionSchema);
