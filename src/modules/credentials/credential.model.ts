import { Schema, model, Document } from 'mongoose';
import { IWebAuthnCredential } from './credential.types';

export interface IWebAuthnCredentialDocument extends Omit<IWebAuthnCredential, 'createdAt' | 'updatedAt'>, Document {
  createdAt: Date;
  updatedAt: Date;
}

const webAuthnCredentialSchema = new Schema<IWebAuthnCredentialDocument>(
  {
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
    credentialId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    publicKey: {
      type: Buffer,
      required: true,
    },
    counter: {
      type: Number,
      required: true,
      default: 0,
    },
    transports: {
      type: [String],
      default: [],
    },
    deviceType: {
      type: String,
      default: null,
    },
    backedUp: {
      type: Boolean,
      default: false,
    },
    friendlyName: {
      type: String,
      default: 'Passkey',
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      default: 'active',
      index: true,
    },
    revokedAt: {
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

// Compound unique index ensuring credentialId is unique per tenant
webAuthnCredentialSchema.index({ tenantId: 1, credentialId: 1 }, { unique: true });

// Compound index for querying user active credentials within a tenant
webAuthnCredentialSchema.index({ tenantId: 1, userId: 1, status: 1 });

export const WebAuthnCredential = model<IWebAuthnCredentialDocument>('WebAuthnCredential', webAuthnCredentialSchema);
