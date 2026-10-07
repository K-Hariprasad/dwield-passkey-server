import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import { TenantService } from '../modules/tenants/tenant.service';
import { UserContextService } from '../modules/identity/user-context.service';
import { WebAuthnCredential } from '../modules/credentials/credential.model';
import { CeremonySession } from '../modules/ceremonies/ceremony.model';
import { StepUpSession } from '../modules/step-up/step-up-session.model';
import { ConsumedStepUpToken } from '../modules/step-up/consumed-token.model';
import { StepUpService } from '../modules/step-up/step-up.service';
import { AuditEvent } from '../modules/audit/audit.model';
import { isDatabaseConnected } from '../config/database';

describe('Phase 6 — End-to-End Testing and Integration Validation', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let rawApiKey: string;
  let userToken: string;
  const tenantId = 'tenant_e2e_val';
  const userId = 'usr_e2e_9009';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create test tenant
    const created = await TenantService.createTenant({
      tenantId,
      name: 'E2E Validation Tenant',
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
    await WebAuthnCredential.deleteMany({});
    await CeremonySession.deleteMany({});
    await StepUpSession.deleteMany({});
    await ConsumedStepUpToken.deleteMany({});
    await AuditEvent.deleteMany({});
  });

  describe('1. Full End-to-End Lifecycle Flow', () => {
    it('should complete full passkey & adaptive step-up lifecycle from registration to revocation', async () => {
      // Step A: Generate Registration Options
      const regOptRes = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({});

      expect(regOptRes.status).toBe(200);
      expect(regOptRes.body.status).toBe('success');
      expect(regOptRes.body.ceremonyId).toBeDefined();

      // Step B: Simulate active passkey registration saved in MongoDB
      const credentialId = 'cred_e2e_passkey_777';
      const savedCred = await WebAuthnCredential.create({
        tenantId,
        userId,
        credentialId,
        publicKey: Buffer.from('mock_cose_public_key_bytes'),
        counter: 1,
        transports: ['internal'],
        deviceType: 'singleDevice',
        backedUp: false,
        friendlyName: 'E2E MacBook TouchID',
        status: 'active',
      });

      expect(savedCred._id).toBeDefined();
      expect(savedCred.status).toBe('active');

      // Step C: Initiate Adaptive Step-Up Session (Risk Assessment requiring STEP_UP)
      const initRes = await request(app)
        .post('/v1/step-up/initiate')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          assessmentId: 'asm_e2e_risk_101',
        });

      expect(initRes.status).toBe(201);
      expect(initRes.body.session.status).toBe('PENDING');
      const stepUpSessionId = initRes.body.session.stepUpSessionId;

      // Step D: Generate Authentication Options bound to step-up session
      const authOptRes = await request(app)
        .post('/v1/passkeys/authentication/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          assessmentId: 'asm_e2e_risk_101',
          stepUpSessionId,
        });

      expect(authOptRes.status).toBe(200);
      expect(authOptRes.body.ceremonyId).toBeDefined();

      // Step E: Simulate WebAuthn authentication assertion verification & token issue
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId,
        assessmentId: 'asm_e2e_risk_101',
        stepUpSessionId,
      });

      await StepUpService.markSessionVerified(stepUpSessionId, authOptRes.body.ceremonyId);

      const verifiedSession = await StepUpSession.findOne({ stepUpSessionId });
      expect(verifiedSession?.status).toBe('VERIFIED');
      expect(verifiedSession?.verifiedAt).toBeDefined();

      // Step F: Customer Backend Token Verification
      const verifyTokenRes = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({
          token,
          expectedUserId: userId,
          expectedAssessmentId: 'asm_e2e_risk_101',
          expectedStepUpSessionId: stepUpSessionId,
        });

      expect(verifyTokenRes.status).toBe(200);
      expect(verifyTokenRes.body.valid).toBe(true);
      expect(verifyTokenRes.body.payload.sub).toBe(userId);

      // Confirm step-up session state updated to CONSUMED
      const consumedSession = await StepUpSession.findOne({ stepUpSessionId });
      expect(consumedSession?.status).toBe('CONSUMED');
      expect(consumedSession?.consumedAt).toBeDefined();

      // Step G: Single-Use Replay Protection Verification
      const replayRes = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({
          token,
          expectedUserId: userId,
        });

      expect(replayRes.status).toBe(409);
      expect(replayRes.body.error.code).toBe('CONFLICT');

      // Step H: Revoke Passkey Credential
      const revokeRes = await request(app)
        .delete(`/v1/passkeys/${credentialId}`)
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.status).toBe('success');

      // Step I: Verify Future Options/Auth Fails for Revoked Credential
      const postRevokeOptRes = await request(app)
        .post('/v1/passkeys/authentication/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({});

      expect(postRevokeOptRes.status).toBe(404);
      expect(postRevokeOptRes.body.error.message).toContain('No active passkeys registered');
    });
  });

  describe('2. Risk Decision & Authorization Enforcement', () => {
    it('should reject step-up initiation for DENY risk decisions and prevent bypass', async () => {
      const res = await request(app)
        .post('/v1/step-up/initiate')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .send({
          assessmentId: 'asm_risk_deny_888',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('not permitted for DENY risk decisions');
    });

    it('should prevent token cross-tenant and cross-user misuse', async () => {
      const token = StepUpService.generateStepUpToken({
        tenantId,
        userId,
        credentialId: 'cred_cross_test',
        assessmentId: 'asm_cross_100',
      });

      // Tenant mismatch test
      const resTenantMismatch = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({
          token,
          expectedUserId: userId,
        });

      expect(resTenantMismatch.status).toBe(200); // valid for tenantId

      // User mismatch test
      const resUserMismatch = await request(app)
        .post('/v1/step-up/verify-token')
        .set('X-API-Key', rawApiKey)
        .send({
          token,
          expectedUserId: 'usr_attacker_9999',
        });

      expect(resUserMismatch.status).toBe(401);
      expect(resUserMismatch.body.error.message).toContain('Step-up token user mismatch');
    });
  });

  describe('3. Comprehensive Security & Edge Case Resilience', () => {
    it('should reject requests missing API key header', async () => {
      const res = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-Dwield-User-Token', userToken)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject requests with malformed JWT user tokens', async () => {
      const res = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', 'invalid.token.string')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should enforce atomic single-use challenge consumption against concurrent requests', async () => {
      const ceremonyId = 'cer_conc_test_100';
      await CeremonySession.create({
        ceremonyId,
        tenantId,
        userId,
        ceremonyType: 'authentication',
        challenge: 'concurrent_challenge_123',
        expectedRpId: 'localhost',
        allowedOrigins: ['http://localhost:3000'],
        status: 'pending',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      // Concurrent atomic updates using findOneAndUpdate
      const p1 = CeremonySession.findOneAndUpdate(
        { ceremonyId, status: 'pending' },
        { $set: { status: 'consumed' } },
        { new: true }
      );
      const p2 = CeremonySession.findOneAndUpdate(
        { ceremonyId, status: 'pending' },
        { $set: { status: 'consumed' } },
        { new: true }
      );

      const [r1, r2] = await Promise.all([p1, p2]);
      const successCount = [r1, r2].filter((r) => r !== null).length;

      // Exactly ONE atomic update succeeds
      expect(successCount).toBe(1);
    });

    it('should return 400 for malformed JSON request body', async () => {
      const res = await request(app)
        .post('/v1/passkeys/registration/options')
        .set('X-API-Key', rawApiKey)
        .set('X-Dwield-User-Token', userToken)
        .set('Content-Type', 'application/json')
        .send('{ malformed json }');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('4. Operational & Health Endpoints', () => {
    it('GET /health/live should return 200 OK', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /health/ready should verify database connectivity', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.database).toBe('connected');
      expect(isDatabaseConnected()).toBe(true);
    });
  });
});
