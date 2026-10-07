import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express, { Request, Response } from 'express';
import { Tenant } from '../modules/tenants/tenant.model';
import { ApiKey } from '../modules/api-keys/api-key.model';
import { TenantService } from '../modules/tenants/tenant.service';
import { authenticateApiKey } from '../middleware/authenticate-api-key';
import { authenticateUser } from '../middleware/authenticate-user';
import { requirePermission } from '../middleware/require-permission';
import { UserContextService } from '../modules/identity/user-context.service';
import { hashApiKey } from '../shared/utils/crypto';
import { errorHandler } from '../middleware/error-handler';

describe('Phase 2 — Tenant and Identity Foundation Tests', () => {
  let mongoServer: MongoMemoryServer;
  let testApp: express.Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create test Express server
    testApp = express();
    testApp.use(express.json());

    // Protected route requiring API key, User context, and 'passkey:register' permission
    testApp.get(
      '/v1/test/protected',
      authenticateApiKey,
      authenticateUser,
      requirePermission('passkey:register'),
      (req: Request, res: Response) => {
        res.status(200).json({
          status: 'success',
          tenantId: req.tenant?.tenantId,
          tenantName: req.tenant?.name,
          rpId: req.tenant?.rpId,
          userId: req.userContext?.userId,
          authMethod: req.userContext?.authMethod,
          permissions: req.apiKey?.permissions,
        });
      }
    );

    // Protected route requiring 'admin:manage' permission (which standard keys do not have)
    testApp.get(
      '/v1/test/admin-only',
      authenticateApiKey,
      authenticateUser,
      requirePermission('admin:manage'),
      (_req: Request, res: Response) => {
        res.status(200).json({ status: 'success' });
      }
    );

    testApp.use(errorHandler);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Tenant.deleteMany({});
    await ApiKey.deleteMany({});
  });

  describe('Tenant & API Key Seed & Management Service', () => {
    it('should create a tenant and generate a publishable API key', async () => {
      const result = await TenantService.createTenant({
        tenantId: 'tenant_acme',
        name: 'Acme Corp',
        rpId: 'acme.com',
        allowedOrigins: ['https://acme.com'],
      });

      expect(result.tenant.tenantId).toBe('tenant_acme');
      expect(result.tenant.rpId).toBe('acme.com');
      expect(result.rawApiKey).toMatch(/^dw_dev_pub_/);
      expect(result.apiKey.keyHash).toBe(hashApiKey(result.rawApiKey));

      const dbTenant = await Tenant.findOne({ tenantId: 'tenant_acme' });
      expect(dbTenant).not.toBeNull();
      expect(dbTenant?.name).toBe('Acme Corp');
    });

    it('should seed default development tenant and API key', async () => {
      const seeded = await TenantService.seedDevTenant();

      expect(seeded.tenantId).toBe('tenant_dev_123');
      expect(seeded.rawApiKey).toBe('dw_dev_pub_1234567890abcdef1234567890abcdef12345678');

      const dbKey = await ApiKey.findOne({ tenantId: 'tenant_dev_123' });
      expect(dbKey).not.toBeNull();
      expect(dbKey?.keyHash).toBe(hashApiKey(seeded.rawApiKey as string));
    });
  });

  describe('API Key Authentication Middleware (authenticateApiKey)', () => {
    it('should reject request when API key header is missing', async () => {
      const res = await request(testApp).get('/v1/test/protected');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('API key is missing');
    });

    it('should accept request with any supplied API key header during unvalidated test mode', async () => {
      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', 'dw_dev_pub_invalidkey1234567890')
        .set('X-Dwield-User-Token', 'dev_user_usr_100');

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('tenant_dev_123');
    });

    it('should reject request when API key is revoked', async () => {
      const { rawApiKey } = await TenantService.createTenant({
        tenantId: 'tenant_revoked',
        name: 'Revoked Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      await ApiKey.updateOne({ tenantId: 'tenant_revoked' }, { $set: { status: 'revoked' } });

      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', rawApiKey);

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('API key is revoked');
    });

    it('should reject request when API key is expired', async () => {
      const { rawApiKey } = await TenantService.createTenant({
        tenantId: 'tenant_expired',
        name: 'Expired Key Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await ApiKey.updateOne({ tenantId: 'tenant_expired' }, { $set: { expiresAt: yesterday } });

      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', rawApiKey);

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('API key has expired');
    });

    it('should reject request when associated tenant is suspended', async () => {
      const { rawApiKey } = await TenantService.createTenant({
        tenantId: 'tenant_suspended',
        name: 'Suspended Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      await Tenant.updateOne({ tenantId: 'tenant_suspended' }, { $set: { status: 'suspended' } });

      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', 'dev_user_usr_100');

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Tenant account is suspended');
    });

    it('should enforce API key permission checks (requirePermission)', async () => {
      const { rawApiKey } = await TenantService.createTenant({
        tenantId: 'tenant_perm',
        name: 'Permission Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      const res = await request(testApp)
        .get('/v1/test/admin-only')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', 'dev_user_usr_100');

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("lacks required permission: 'admin:manage'");
    });
  });

  describe('User Context Authentication Middleware (authenticateUser)', () => {
    it('should reject request when X-Dwield-User-Token header is missing', async () => {
      const { rawApiKey } = await TenantService.createTenant({
        tenantId: 'tenant_valid',
        name: 'Valid Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', rawApiKey);

      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('User identity context token is missing');
    });

    it('should authenticate user via Development Identity Adapter', async () => {
      const { rawApiKey } = await TenantService.createTenant({
        tenantId: 'tenant_valid',
        name: 'Valid Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', 'dev_user_usr_9999');

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('tenant_valid');
      expect(res.body.userId).toBe('usr_9999');
      expect(res.body.authMethod).toBe('dev_adapter');
    });

    it('should authenticate user via standard customer-signed JWT token', async () => {
      const { rawApiKey } = await TenantService.createTenant({
        tenantId: 'tenant_jwt',
        name: 'JWT Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      const jwtToken = UserContextService.generateSignedJwtUserToken(
        'jwt_user_777',
        'tenant_jwt',
        'dev-tenant-secret'
      );

      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', jwtToken);

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe('tenant_jwt');
      expect(res.body.userId).toBe('jwt_user_777');
      expect(res.body.authMethod).toBe('jwt_signed_token');
    });

    it('should reject request when JWT user token tenantId mismatches API key tenantId', async () => {
      const tenantA = await TenantService.createTenant({
        tenantId: 'tenant_company_a',
        name: 'Company A',
        rpId: 'a.com',
        allowedOrigins: ['https://a.com'],
      });

      // Issue JWT token specifying tenant_company_b
      const jwtTokenForB = UserContextService.generateSignedJwtUserToken(
        'user_b',
        'tenant_company_b',
        'dev-tenant-secret'
      );

      // Attempt request with API key for Company A, but JWT for Company B
      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', tenantA.rawApiKey)
        .set('X-Dwield-User-Token', jwtTokenForB);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("Tenant identity mismatch between API key ('tenant_company_a') and user token ('tenant_company_b')");
    });
  });

  describe('Tenant Isolation Boundaries', () => {
    it('should guarantee that Tenant A key resolves strictly to Tenant A and not Tenant B', async () => {
      const tenantA = await TenantService.createTenant({
        tenantId: 'tenant_alpha',
        name: 'Tenant Alpha',
        rpId: 'alpha.com',
        allowedOrigins: ['https://alpha.com'],
      });

      const tenantB = await TenantService.createTenant({
        tenantId: 'tenant_beta',
        name: 'Tenant Beta',
        rpId: 'beta.com',
        allowedOrigins: ['https://beta.com'],
      });

      const resA = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', tenantA.rawApiKey)
        .set('X-Dwield-User-Token', 'dev_user_user_a');

      expect(resA.status).toBe(200);
      expect(resA.body.tenantId).toBe('tenant_alpha');

      const resB = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', tenantB.rawApiKey)
        .set('X-Dwield-User-Token', 'dev_user_user_b');

      expect(resB.status).toBe(200);
      expect(resB.body.tenantId).toBe('tenant_beta');
    });

    it('should ensure a valid API key cannot compensate for an invalid user context', async () => {
      const tenant = await TenantService.createTenant({
        tenantId: 'tenant_strict',
        name: 'Strict Tenant',
        rpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
      });

      const res = await request(testApp)
        .get('/v1/test/protected')
        .set('X-API-Key', tenant.rawApiKey)
        .set('X-Dwield-User-Token', 'invalid_user_token_format');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
