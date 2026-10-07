import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import { TenantService } from '../modules/tenants/tenant.service';
import { CeremonySession } from '../modules/ceremonies/ceremony.model';
import { WebAuthnCredential } from '../modules/credentials/credential.model';
import { StepUpSession } from '../modules/step-up/step-up-session.model';
import { AuditEvent } from '../modules/audit/audit.model';

describe('Phase 4 — Passkey Authentication & Credential Lifecycle Tests', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let rawApiKey: string;
  const tenantId = 'tenant_auth_test';
  const userId = 'usr_auth_2002';
  const userToken = `dev_user_${userId}`;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create test tenant
    const created = await TenantService.createTenant({
      tenantId,
      name: 'Authentication Test Tenant',
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
    await StepUpSession.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  describe('POST /v1/passkeys/authentication/options', () => {
    it('should return 404 NOT_FOUND when user has no active passkeys registered', async () => {
      const res = await request(app)
        .post('/v1/passkeys/authentication/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('No active passkeys registered');
    });

    it('should generate authentication options when active passkey exists', async () => {
      // Seed an active credential
      await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId: 'auth_cred_id_001',
        publicKey: Buffer.from('mock_public_key'),
        counter: 10,
        status: 'active',
        friendlyName: 'My MacBook TouchID',
      });

      // Seed pending step-up session bound to assessmentId and stepUpSessionId
      await StepUpSession.create({
        stepUpSessionId: 'step_sess_888',
        tenantId,
        userId,
        assessmentId: 'asm_risk_999',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const res = await request(app)
        .post('/v1/passkeys/authentication/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          assessmentId: 'asm_risk_999',
          stepUpSessionId: 'step_sess_888',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body).toHaveProperty('ceremonyId');
      expect(res.body.options.rpId).toBe('localhost');
      expect(res.body.options.allowCredentials).toHaveLength(1);
      expect(res.body.options.allowCredentials[0].id).toBe('auth_cred_id_001');

      // Verify ceremony session persisted with assessmentId & stepUpSessionId
      const ceremony = await CeremonySession.findOne({ ceremonyId: res.body.ceremonyId });
      expect(ceremony).not.toBeNull();
      expect(ceremony?.assessmentId).toBe('asm_risk_999');
      expect(ceremony?.stepUpSessionId).toBe('step_sess_888');

      // Verify Audit Event logged
      const audit = await AuditEvent.findOne({ action: 'authentication_options_generated' });
      expect(audit).not.toBeNull();
      expect(audit?.tenantId).toBe(tenantId);
    });

    it('should reject request when API key or user token is missing', async () => {
      const res = await request(app)
        .post('/v1/passkeys/authentication/options')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /v1/passkeys/authentication/verify', () => {
    it('should reject verification if ceremonyId does not exist', async () => {
      const res = await request(app)
        .post('/v1/passkeys/authentication/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: 'cer_invalid_auth',
          response: {
            id: 'auth_cred_id_001',
            rawId: 'auth_cred_id_001',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              authenticatorData: 'mock',
              signature: 'mock',
            },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Authentication ceremony session is invalid, expired, or already consumed');
    });

    it('should reject verification if ceremony challenge is expired', async () => {
      const expiredSession = await CeremonySession.create({
        ceremonyId: 'cer_expired_auth_123',
        tenantId,
        userId,
        ceremonyType: 'authentication',
        challenge: 'expired_auth_challenge',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
      });

      const res = await request(app)
        .post('/v1/passkeys/authentication/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: expiredSession.ceremonyId,
          response: {
            id: 'mock_cred_id',
            rawId: 'mock_cred_id',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              authenticatorData: 'mock',
              signature: 'mock',
            },
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Authentication ceremony session is invalid, expired, or already consumed');
    });

    it('should enforce single-use challenge and reject replay attempts', async () => {
      const ceremony = await CeremonySession.create({
        ceremonyId: 'cer_replay_auth_test',
        tenantId,
        userId,
        ceremonyType: 'authentication',
        challenge: 'replay_auth_challenge',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 300000),
      });

      const payload = {
        ceremonyId: ceremony.ceremonyId,
        response: {
          id: 'auth_cred_id_001',
          rawId: 'auth_cred_id_001',
          type: 'public-key',
          response: {
            clientDataJSON: 'mock',
            authenticatorData: 'mock',
            signature: 'mock',
          },
        },
      };

      // 1st attempt consumes session
      await request(app)
        .post('/v1/passkeys/authentication/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send(payload);

      const dbSession = await CeremonySession.findOne({ ceremonyId: ceremony.ceremonyId });
      expect(dbSession?.status).toBe('consumed');

      // 2nd attempt fails due to consumed session
      const res2 = await request(app)
        .post('/v1/passkeys/authentication/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send(payload);

      expect(res2.status).toBe(400);
      expect(res2.body.error.message).toContain('Authentication ceremony session is invalid, expired, or already consumed');
    });

    it('should reject authentication for a revoked credential', async () => {
      await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId: 'revoked_cred_999',
        publicKey: Buffer.from('mock_pk'),
        counter: 1,
        status: 'revoked',
      });

      const ceremony = await CeremonySession.create({
        ceremonyId: 'cer_auth_revoked_test',
        tenantId,
        userId,
        ceremonyType: 'authentication',
        challenge: 'auth_challenge_revoked',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 300000),
      });

      const res = await request(app)
        .post('/v1/passkeys/authentication/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: ceremony.ceremonyId,
          response: {
            id: 'revoked_cred_999',
            rawId: 'revoked_cred_999',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              authenticatorData: 'mock',
              signature: 'mock',
            },
          },
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Passkey credential has been revoked');
    });

    it('should reject authentication if credential belongs to another user', async () => {
      const otherUserId = 'usr_other_999';

      await WebAuthnCredential.create({
        tenantId,
        userId: otherUserId,
        credentialId: 'other_user_cred_123',
        publicKey: Buffer.from('mock_pk'),
        counter: 1,
        status: 'active',
      });

      const ceremony = await CeremonySession.create({
        ceremonyId: 'cer_mismatch_user',
        tenantId,
        userId,
        ceremonyType: 'authentication',
        challenge: 'mismatch_challenge',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 300000),
      });

      const res = await request(app)
        .post('/v1/passkeys/authentication/verify')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          ceremonyId: ceremony.ceremonyId,
          response: {
            id: 'other_user_cred_123',
            rawId: 'other_user_cred_123',
            type: 'public-key',
            response: {
              clientDataJSON: 'mock',
              authenticatorData: 'mock',
              signature: 'mock',
            },
          },
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Passkey credential does not belong to the authenticated user');
    });
  });

  describe('Credential Management (GET /v1/passkeys & DELETE /v1/passkeys/:credentialId)', () => {
    it('should list active passkey credentials for the user', async () => {
      await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId: 'cred_list_01',
        publicKey: Buffer.from('pk_1'),
        counter: 5,
        friendlyName: 'Work Laptop',
        status: 'active',
      });

      await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId: 'cred_list_02',
        publicKey: Buffer.from('pk_2'),
        counter: 1,
        friendlyName: 'Personal Phone',
        status: 'active',
      });

      const res = await request(app)
        .get('/v1/passkeys')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.credentials).toHaveLength(2);
      expect(res.body.credentials[0]).toHaveProperty('credentialId');
      expect(res.body.credentials[0]).toHaveProperty('friendlyName');
      expect(res.body.credentials[0]).not.toHaveProperty('publicKey'); // MUST NOT expose binary public key!
    });

    it('should revoke a credential and prevent future authentication', async () => {
      await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId: 'cred_to_revoke',
        publicKey: Buffer.from('pk_revoke'),
        counter: 1,
        status: 'active',
      });

      const delRes = await request(app)
        .delete('/v1/passkeys/cred_to_revoke')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken);

      expect(delRes.status).toBe(200);
      expect(delRes.body.status).toBe('success');

      const dbCred = await WebAuthnCredential.findOne({ credentialId: 'cred_to_revoke' });
      expect(dbCred?.status).toBe('revoked');
      expect(dbCred?.revokedAt).toBeDefined();

      const audit = await AuditEvent.findOne({ action: 'credential_revoked' });
      expect(audit).not.toBeNull();
      expect(audit?.details).toEqual({ credentialId: 'cred_to_revoke' });

      const listRes = await request(app)
        .get('/v1/passkeys')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken);

      expect(listRes.body.credentials).toHaveLength(0);
    });

    it('should reject revocation attempt for credential belonging to another user', async () => {
      await WebAuthnCredential.create({
        tenantId,
        userId: 'usr_someone_else',
        credentialId: 'cred_other_user',
        publicKey: Buffer.from('pk_other'),
        counter: 0,
        status: 'active',
      });

      const res = await request(app)
        .delete('/v1/passkeys/cred_other_user')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('You do not have permission to manage this passkey credential');
    });
  });
});
