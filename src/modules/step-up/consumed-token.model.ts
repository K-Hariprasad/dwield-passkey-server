import { Schema, model, Document } from 'mongoose';

export interface IConsumedStepUpTokenDocument extends Document {
  jti: string;
  tenantId: string;
  userId: string;
  assessmentId?: string;
  consumedAt: Date;
  expiresAt: Date;
}

const consumedStepUpTokenSchema = new Schema<IConsumedStepUpTokenDocument>(
  {
    jti: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
    },
    assessmentId: {
      type: String,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index to auto-clean expired consumed tokens
    },
  },
  {
    timestamps: false,
  }
);

export const ConsumedStepUpToken = model<IConsumedStepUpTokenDocument>(
  'ConsumedStepUpToken',
  consumedStepUpTokenSchema
);
