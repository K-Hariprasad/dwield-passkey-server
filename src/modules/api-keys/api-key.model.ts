import { Schema, model, Document } from 'mongoose';
import { IApiKey } from './api-key.types';

export interface IApiKeyDocument extends Omit<IApiKey, 'createdAt' | 'updatedAt'>, Document {
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKeyDocument>(
  {
    keyId: {
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
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keyType: {
      type: String,
      enum: ['publishable', 'secret'],
      default: 'publishable',
    },
    status: {
      type: String,
      enum: ['active', 'revoked', 'expired'],
      default: 'active',
      index: true,
    },
    permissions: {
      type: [String],
      default: ['passkey:register', 'passkey:authenticate', 'passkey:manage'],
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active keys by tenant
apiKeySchema.index({ tenantId: 1, status: 1 });

export const ApiKey = model<IApiKeyDocument>('ApiKey', apiKeySchema);
