import { Schema, model, Document } from 'mongoose';
import { ITenant } from './tenant.types';

export interface ITenantDocument extends Omit<ITenant, 'createdAt' | 'updatedAt'>, Document {
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenantDocument>(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'inactive'],
      default: 'active',
      index: true,
    },
    rpId: {
      type: String,
      required: true,
      trim: true,
    },
    allowedOrigins: {
      type: [String],
      required: true,
      default: [],
    },
    userVerificationPolicy: {
      type: String,
      enum: ['required', 'preferred', 'discouraged'],
      default: 'preferred',
    },
  },
  {
    timestamps: true,
  }
);

export const Tenant = model<ITenantDocument>('Tenant', tenantSchema);
