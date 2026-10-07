# Dwield Passkey Server — Proof of Concept (POC)

Independent Node.js Passkey Service for Dwield client-side device biometrics and fraud-risk platform. Built with **Node.js LTS**, **TypeScript (Strict Mode)**, **Express.js**, **MongoDB / Mongoose**, and **`@simplewebauthn/server`**.

---

## 🏛️ System Architecture

Dwield operates as an adaptive-authentication and risk layer, **not an identity provider**. The customer application remains responsible for its own user identity lifecycle, session management, and final access control decisions.

```
┌─────────────────────────┐       ┌───────────────────────────┐
│   Customer App Frontend │       │   Customer App Backend    │
│  (Session & User Auth)  │       │  (Enforces Final Access)  │
└────────────┬────────────┘       └─────────────▲─────────────┘
             │                                  │
             │ WebAuthn Ceremony                │ Step-Up Token Verification
             ▼                                  │ (POST /v1/step-up/verify-token)
┌───────────────────────────────────────────────┴─────────────┐
│                 Dwield Passkey Server                       │
│    - Tenant Resolution (API Key Hash)                       │
│    - User Context Validation (HMAC / Dev Adapter)           │
│    - WebAuthn Ceremony Management & Single-Use Challenges   │
│    - Passkey Credential Persistence (Public Key Only)       │
│    - Signed Step-Up Token Generation & Replay Prevention    │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     MongoDB     │
                    │  (7.0 Document) │
                    └─────────────────┘
```

---

## 🚀 Quick Start & Local Setup

### 1. Prerequisites
- **Node.js**: v20+ LTS (Tested on Node v22.20)
- **npm**: v10+
- **Docker Compose** (for local MongoDB instance)

### 2. Environment Setup
```bash
# Copy example environment configuration
cp .env.example .env

# Start local MongoDB 7 via Docker Compose
docker compose up -d

# Install dependencies
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
The server will automatically start on `http://localhost:3000` and seed the default development tenant (`tenant_dev_123`) and development API key (`dw_dev_pub_1234567890abcdef1234567890abcdef12345678`).

---

## 🌐 Interactive Browser WebAuthn Test Client

Open `http://localhost:3000` in any WebAuthn-supported browser (Chrome, Edge, Safari, Brave, Firefox):

1. **Passkey Registration**:
   - Click **🚀 Register Passkey** to trigger a real browser WebAuthn ceremony (Windows Hello, Touch ID, Face ID, or YubiKey).
   - Verifies attestation on the server and registers the public key in MongoDB.
2. **Passkey Authentication**:
   - Click **⚡ Authenticate with Passkey** to perform an assertion ceremony.
   - Verifies signature, updates counter, and generates a cryptographically signed **Step-Up Verification Token**.
3. **Step-Up Verification Token API**:
   - Click **Check Single-Use Token Verification API** to test backend verification.
   - Demonstrates single-use token consumption and replay prevention (retrying returns `409 Conflict`).
4. **Credential Management**:
   - Click **🔄 Refresh Passkeys List** to inspect active credentials and test revocation.

---

## 🛡️ WebAuthn Domain & RP ID Configuration Rules

- **Development Setup**: WebAuthn standard mandates that browser WebAuthn ceremonies for `rpId: "localhost"` take place on `http://localhost:<port>` or `http://127.0.0.1:<port>`.
- **Production Setup**:
  - The `rpId` configured in tenant configuration MUST match the customer application domain or its parent domain (e.g. `app.customer.com` can use `rpId: "customer.com"`).
  - Port numbers must NOT be included in `rpId`.
  - Origin configuration in tenant (`allowedOrigins`) must specify exact protocol, domain, and port (e.g., `['https://app.customer.com']`).

---

## 📡 API Reference

### Health Probes
- `GET /health/live` — Returns process liveness (`200 OK`).
- `GET /health/ready` — Returns database readiness (`200 OK` if MongoDB connected, `503 Service Unavailable` if disconnected).

### Passkey Registration
- `POST /v1/passkeys/registration/options`
  - **Headers**: `X-API-Key`, `X-Dwield-User-Token`
  - **Body**: `{ "userName": "alice@example.com", "userDisplayName": "Alice" }`
  - **Returns**: `{ ceremonyId, options }`
- `POST /v1/passkeys/registration/verify`
  - **Headers**: `X-API-Key`, `X-Dwield-User-Token`
  - **Body**: `{ ceremonyId, friendlyName, response }`
  - **Returns**: `{ verified: true, credentialId }`

### Passkey Authentication
- `POST /v1/passkeys/authentication/options`
  - **Headers**: `X-API-Key`, `X-Dwield-User-Token`
  - **Body**: `{ "assessmentId": "asm_123", "stepUpSessionId": "step_456" }`
  - **Returns**: `{ ceremonyId, options }`
- `POST /v1/passkeys/authentication/verify`
  - **Headers**: `X-API-Key`, `X-Dwield-User-Token`
  - **Body**: `{ ceremonyId, response }`
  - **Returns**: `{ verified: true, credentialId, stepUpToken }`

### Step-Up Verification (Customer Backend Integration)
- `POST /v1/step-up/verify-token`
  - **Headers**: `X-API-Key`
  - **Body**: `{ "token": "<stepUpToken>", "expectedAssessmentId": "asm_123" }`
  - **Returns**: `{ valid: true, payload }`

### Credential Management
- `GET /v1/passkeys` — List active user passkeys.
- `DELETE /v1/passkeys/:credentialId` — Revoke a passkey.

---

## 🧪 Testing & Verification

Run the automated test suite (35 unit and integration tests across 5 test suites):

```bash
# Run Vitest test suite
npm run test

# Type checking
npm run type-check

# Production build
npm run build
```
