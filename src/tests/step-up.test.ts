import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import { TenantService } from '../modules/tenants/tenant.service';
import { StepUpService } from '../modules/step-up/step-up.service';
import { ConsumedStepUpToken } from '../modules/step-up/consumed-token.model';
import { UserContextService } from '../modules/identity/user-context.service';

describe('Phase 5 — Adaptive Step-Up Binding Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let rawApiKey: string;
  let userToken: string;
  const tenantId = 'tenant_stepup_test';
  const userId = 'usr_stepup_3003';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create test tenant
    const created = await TenantService.createTenant({
      tenantId,
      name: 'StepUp Test Tenant',
      rpId: 'localhost',
      allowedOrigins: ['http://localhost:3000'],
    });

    rawApiKey = created.rawApiKey;
    userToken = UserContextService.generateSignedJwtUserToken(userId, tenantId);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await ConsumedStepUpToken.deleteMany({});
  });

  describe('POST /v1/step-up/initiate (Step-Up Session Initiation API)', () => {
    it('should initiate a new PENDING step-up session for valid tenant and user', async () => {
      const res = await request(app)
        .post('/v1/step-up/initiate')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          assessmentId: 'asm_stepup_1001',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.session.stepUpSessionId).toBeDefined();
      expect(res.body.session.tenantId).toBe(tenantId);
      expect(res.body.session.userId).toBe(userId);
      expect(res.body.session.assessmentId).toBe('asm_stepup_1001');
      expect(res.body.session.status).toBe('PENDING');
      expect(res.body.session.expiresAt).toBeDefined();
    });

    it('should reject step-up initiation for DENY risk decisions', async () => {
      const res = await request(app)
        .post('/v1/step-up/initiate')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          assessmentId: 'asm_deny_123',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('not permitted for DENY risk decisions');
    });

    it('should reject initiation when user context header is missing', async () => {
      const res = await request(app)
        .post('/v1/step-up/initiate')
        .set('X-API-Key', rawApiKey)
        .send({
          assessmentId: 'asm_stepup_1002',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('StepUpService Token Generation & Local Verification', () => {
    it('should generate a valid signed Step-Up Verification Token', async () => {
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId: 'cred_stepup_100',
        assessmentId: 'asm_risk_777',
        stepUpSessionId: 'sess_stepup_888',
        tenantSecret: 'dev-tenant-secret',
      });

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(2);

      const verification = await StepUpService.verifyStepUpToken(
        {
          token,
          expectedTenantId: tenantId,
          expectedUserId: userId,
          expectedAssessmentId: 'asm_risk_777',
          expectedStepUpSessionId: 'sess_stepup_888',
        },
        'dev-tenant-secret'
      );

      expect(verification.valid).toBe(true);
      expect(verification.payload.sub).toBe(userId);
      expect(verification.payload.tenantId).toBe(tenantId);
      expect(verification.payload.assessmentId).toBe('asm_risk_777');
      expect(verification.payload.stepUpSessionId).toBe('sess_stepup_888');
      expect(verification.payload.iss).toBe('dwield-passkey-server');
    });

    it('should enforce single-use replay protection for step-up tokens', async () => {
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId: 'cred_stepup_101',
        tenantSecret: 'dev-tenant-secret',
      });

      // First verification call succeeds
      const v1 = await StepUpService.verifyStepUpToken(
        { token, expectedTenantId: tenantId },
        'dev-tenant-secret'
      );
      expect(v1.valid).toBe(true);

      // Second verification call fails due to replay prevention!
      await expect(
        StepUpService.verifyStepUpToken(
          { token, expectedTenantId: tenantId },
          'dev-tenant-secret'
        )
      ).rejects.toThrow('Step-up verification token has already been consumed (replay attempt detected)');
    });
  });

  describe('POST /v1/step-up/verify-token (Customer Backend Integration API)', () => {
    it('should verify valid step-up token and return payload', async () => {
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId: 'cred_api_verify_200',
        assessmentId: 'asm_risk_555',
        stepUpSessionId: 'step_sess_444',
      });

      const res = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({
          token,
          expectedUserId: userId,
          expectedAssessmentId: 'asm_risk_555',
          expectedStepUpSessionId: 'step_sess_444',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.valid).toBe(true);
      expect(res.body.payload.sub).toBe(userId);
      expect(res.body.payload.assessmentId).toBe('asm_risk_555');
    });

    it('should reject replay attempt when calling verify-token API twice', async () => {
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId: 'cred_api_replay_300',
      });

      // 1st API call
      const res1 = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({ token });

      expect(res1.status).toBe(200);

      // 2nd API call with same token
      const res2 = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({ token });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('CONFLICT');
      expect(res2.body.error.message).toContain('replay attempt detected');
    });

    it('should reject step-up token with invalid signature', async () => {
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId: 'cred_invalid_sig',
        tenantSecret: 'wrong-secret-key',
      });

      const res = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({ token });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid step-up verification token signature');
    });

    it('should reject step-up token with mismatched assessmentId', async () => {
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId: 'cred_mismatched_asm',
        assessmentId: 'asm_original_111',
      });

      const res = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({
          token,
          expectedAssessmentId: 'asm_tampered_999', // Client/Attacker tried to swap assessmentId!
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('Step-up token assessment mismatch');
    });
  });
});

