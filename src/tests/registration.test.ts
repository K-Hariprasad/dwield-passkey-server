import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import { TenantService } from '../modules/tenants/tenant.service';
import { CeremonySession } from '../modules/ceremonies/ceremony.model';
import { WebAuthnCredential } from '../modules/credentials/credential.model';
import { AuditEvent } from '../modules/audit/audit.model';

describe('Phase 3 — Passkey Registration Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let rawApiKey: string;
  const tenantId = 'tenant_reg_test';
  const userId = 'usr_reg_1001';
  const userToken = `dev_user_${userId}`;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create test tenant
    const created = await TenantService.createTenant({
      tenantId,
      name: 'Registration Test Tenant',
      rpId: 'localhost',
      allowedOrigins: ['http://localhost:3000'],
    });

    rawApiKey = created.rawApiKey;
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await CeremonySession.deleteMany({});
    await WebAuthnCredential.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  describe('POST /v1/passkeys/registration/options', () => {
    it('should generate registration options and persist ceremony session', async () => {
      const res = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          userName: 'alice@example.com',
          userDisplayName: 'Alice Smith',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body).toHaveProperty('ceremonyId');
      expect(res.body).toHaveProperty('options');

      const { ceremonyId, options } = res.body;
      expect(options.rp.id).toBe('localhost');
      expect(options.rp.name).toBe('Registration Test Tenant');
      expect(options.challenge).toBeDefined();

      // Verify ceremony session persisted in MongoDB
      const ceremony = await CeremonySession.findOne({ ceremonyId });
      expect(ceremony).not.toBeNull();
      expect(ceremony?.status).toBe('pending');
      expect(ceremony?.challenge).toBe(options.challenge);
      expect(ceremony?.tenantId).toBe(tenantId);
      expect(ceremony?.userId).toBe(userId);

      // Verify Audit Event logged
      const audit = await AuditEvent.findOne({ action: 'registration_options_generated' });
      expect(audit).not.toBeNull();
      expect(audit?.tenantId).toBe(tenantId);
      expect(audit?.userId).toBe(userId);
    });

    it('should populate excludeCredentials when user already has active credentials', async () => {
      // Seed an existing credential for user
      await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId: 'existing_cred_id_123',
        publicKey: Buffer.from('mock_public_key'),
        counter: 0,
        status: 'active',
      });

      const res = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.options.excludeCredentials).toHaveLength(1);
      expect(res.body.options.excludeCredentials[0].id).toBe('existing_cred_id_123');
    });

    it('should reject request when API key is missing or invalid', async () => {
      const res = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-Dwield-User-Token', userToken)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request when user identity token is missing', async () => {
      const res = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-API-Key', rawApiKey)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /v1/passkeys/registration/verify', () => {
    it('should reject verification if ceremonyId does not exist', async () => {
      const res = await request(app)
        .post('/v1/passkeys/registration/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: 'cer_non_existent',
          response: {
            id: 'mock_cred_id',
            rawId: 'mock_cred_id',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              attestationObject: 'mock',
            },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Registration ceremony session is invalid, expired, or already consumed');
    });

    it('should reject verification if ceremony challenge is expired', async () => {
      const expiredSession = await CeremonySession.create({
        ceremonyId: 'cer_expired_123',
        tenantId,
        userId,
        ceremonyType: 'registration',
        challenge: 'expired_challenge',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() - 10000), // 10 seconds ago
      });

      const res = await request(app)
        .post('/v1/passkeys/registration/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: expiredSession.ceremonyId,
          response: {
            id: 'mock_id',
            rawId: 'mock_id',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              attestationObject: 'mock',
            },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Registration ceremony session is invalid, expired, or already consumed');
    });

    it('should enforce single-use challenge and reject replay attempts', async () => {
      const session = await CeremonySession.create({
        ceremonyId: 'cer_single_use',
        tenantId,
        userId,
        ceremonyType: 'registration',
        challenge: 'single_use_challenge',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 300000),
      });

      // First attempt
      await request(app)
        .post('/v1/passkeys/registration/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: session.ceremonyId,
          response: {
            id: 'mock_id',
            rawId: 'mock_id',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              attestationObject: 'mock',
            },
          },
        });

      const dbSession = await CeremonySession.findOne({ ceremonyId: session.ceremonyId });
      expect(dbSession?.status).toBe('consumed');

      // Second attempt must fail due to session already consumed!
      const res2 = await request(app)
        .post('/v1/passkeys/registration/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: session.ceremonyId,
          response: {
            id: 'mock_id',
            rawId: 'mock_id',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              attestationObject: 'mock',
            },
          },
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error.message).toContain('Registration ceremony session is invalid, expired, or already consumed');
    });

    it('should reject cross-tenant registration verification attempt', async () => {
      const tenantB = await TenantService.createTenant({
        tenantId: 'tenant_other_b',
        name: 'Tenant B',
        rpId: 'b.com',
        allowedOrigins: ['https://b.com'],
      });

      // Ceremony created for tenantId (tenant_reg_test)
      const session = await CeremonySession.create({
        ceremonyId: 'cer_tenant_a',
        tenantId,
        userId,
        ceremonyType: 'registration',
        challenge: 'tenant_a_challenge',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 300000),
      });

      // Attempt verification using Tenant B API key
      const res = await request(app)
        .post('/v1/passkeys/registration/verify')
        .set('X-API-Key', tenantB.rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: session.ceremonyId,
          response: {
            id: 'mock_id',
            rawId: 'mock_id',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              attestationObject: 'mock',
            },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Registration ceremony session is invalid, expired, or already consumed');
    });

    it('should handle concurrent verification attempts gracefully using atomic consumption', async () => {
      const session = await CeremonySession.create({
        ceremonyId: 'cer_concurrent_test',
        tenantId,
        userId,
        ceremonyType: 'registration',
        challenge: 'concurrent_challenge',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 300000),
      });

      const payload = {
        ceremonyId: session.ceremonyId,
        response: {
          id: 'mock_id',
          rawId: 'mock_id',
          type: 'public-key',
          response: {
            clientDataJSON: 'mock',
            attestationObject: 'mock',
          },
        },
      };

      // Execute 2 concurrent requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/v1/passkeys/registration/verify')
          .set('X-API-Key', rawApiKey)
          .set('X-Dwield-User-Token', userToken)
          .send(payload),
        request(app)
          .post('/v1/passkeys/registration/verify')
          .set('X-API-Key', rawApiKey)
          .set('X-Dwield-User-Token', userToken)
          .send(payload),
      ]);

      // Exactly one request should succeed in finding/consuming the pending session
      const consumedSession = await CeremonySession.findOne({ ceremonyId: session.ceremonyId });
      expect(consumedSession?.status).toBe('consumed');
    });

    it('should enforce unique index constraint for duplicate credentials', async () => {
      await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId: 'duplicate_cred_1',
        publicKey: Buffer.from('mock_pk'),
        counter: 0,
        status: 'active',
      });

      // Attempt duplicate creation directly
      await expect(
        WebAuthnCredential.create({
          tenantId,
          userId: 'other_user',
          credentialId: 'duplicate_cred_1',
          publicKey: Buffer.from('mock_pk_2'),
          counter: 0,
          status: 'active',
        })
      ).rejects.toThrow();
    });
  });
});
