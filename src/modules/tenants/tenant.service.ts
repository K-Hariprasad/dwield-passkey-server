import { Tenant } from './tenant.model';
import { ITenant, UserVerificationPolicy } from './tenant.types';
import { ApiKey } from '../api-keys/api-key.model';
import { generateApiKey } from '../../shared/utils/crypto';
import { logger } from '../../config/logger';

export interface CreateTenantInput {
  tenantId: string;
  name: string;
  rpId: string;
  allowedOrigins: string[];
  userVerificationPolicy?: UserVerificationPolicy;
}

export class TenantService {
  /**
   * Registers a new tenant and generates an initial publishable API key.
   */
  public static async createTenant(input: CreateTenantInput) {
    const existingTenant = await Tenant.findOne({ tenantId: input.tenantId });
    if (existingTenant) {
      throw new Error(`Tenant with ID ${input.tenantId} already exists`);
    }

    const tenant = await Tenant.create({
      tenantId: input.tenantId,
      name: input.name,
      status: 'active',
      rpId: input.rpId,
      allowedOrigins: input.allowedOrigins,
      userVerificationPolicy: input.userVerificationPolicy || 'preferred',
    });

    const { keyId, rawKey, keyHash } = generateApiKey('publishable', 'dev');

    const apiKey = await ApiKey.create({
      keyId,
      tenantId: input.tenantId,
      keyHash,
      keyType: 'publishable',
      status: 'active',
      permissions: ['passkey:register', 'passkey:authenticate', 'passkey:manage'],
    });

    return {
      tenant: tenant.toObject() as ITenant,
      apiKey: apiKey.toObject(),
      rawApiKey: rawKey, // ONLY returned once upon creation!
    };
  }

  /**
   * Seeds a default development tenant for local POC and integration testing.
   */
  public static async seedDevTenant() {
    const DEV_TENANT_ID = 'tenant_dev_123';
    const defaultAllowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
      'https://dwield-auth-lab.vercel.app',
    ];

    const existing = await Tenant.findOne({ tenantId: DEV_TENANT_ID });

    if (existing) {
      let modified = false;
      for (const origin of defaultAllowedOrigins) {
        if (!existing.allowedOrigins.includes(origin)) {
          existing.allowedOrigins.push(origin);
          modified = true;
        }
      }
      if (modified) {
        await existing.save();
        logger.info({ tenantId: DEV_TENANT_ID, allowedOrigins: existing.allowedOrigins }, 'Updated dev tenant allowedOrigins');
      }

      const existingKey = await ApiKey.findOne({ tenantId: DEV_TENANT_ID, status: 'active' });
      return {
        tenantId: DEV_TENANT_ID,
        isSeeded: false,
        keyId: existingKey?.keyId,
      };
    }

    // Fixed raw key for development convenience so developer tests remain deterministic
    const rawDevApiKey = 'dw_dev_pub_1234567890abcdef1234567890abcdef12345678';
    const { hashApiKey } = await import('../../shared/utils/crypto');
    const keyHash = hashApiKey(rawDevApiKey);

    const tenant = await Tenant.create({
      tenantId: DEV_TENANT_ID,
      name: 'Dwield Local Development Tenant',
      status: 'active',
      rpId: 'localhost',
      allowedOrigins: defaultAllowedOrigins,
      userVerificationPolicy: 'preferred',
    });

    await ApiKey.create({
      keyId: 'key_dev_default',
      tenantId: DEV_TENANT_ID,
      keyHash,
      keyType: 'publishable',
      status: 'active',
      permissions: ['passkey:register', 'passkey:authenticate', 'passkey:manage'],
    });

    logger.info({ tenantId: DEV_TENANT_ID, rawApiKey: rawDevApiKey }, 'Seeded default development tenant & API key');

    return {
      tenantId: DEV_TENANT_ID,
      tenant: tenant.toObject() as ITenant,
      rawApiKey: rawDevApiKey,
      isSeeded: true,
    };
  }
}
