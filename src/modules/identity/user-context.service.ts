import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { IUserContext } from '../../types/express';
import { UnauthorizedError, ForbiddenError } from '../../shared/errors/app-error';
import { safeCompare } from '../../shared/utils/crypto';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

export interface ParseUserTokenResult {
  userContext: IUserContext;
  isDevAdapterUsed: boolean;
}

export interface UserTokenValidationOptions {
  expectedTenantId?: string;
  tenantSecret?: string;
}

export class UserContextService {
  public static EXPECTED_ISSUER = 'dwield-customer';
  public static EXPECTED_AUDIENCE = 'dwield-passkey-server';

  /**
   * Validates a customer-issued user identity token.
   *
   * Supports:
   * 1. Standard Customer Signed JWT (jsonwebtoken library)
   * 2. HMAC Signed Token (<userId>.<timestamp>.<signature>)
   * 3. Isolated Development Adapter (disabled in production)
   */
  public static parseAndValidateToken(
    token: string,
    options: UserTokenValidationOptions = {}
  ): ParseUserTokenResult {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedError('User identity context token is missing or invalid');
    }

    const { expectedTenantId, tenantSecret = process.env.TENANT_SECRET || 'dev-tenant-secret' } = options;
    const trimmedToken = token.trim();

    // 1. Development Identity Adapter (strictly isolated & disabled outside dev/test)
    if (trimmedToken.startsWith('dev:') || trimmedToken.startsWith('dev_user_')) {
      if (env.NODE_ENV === 'production') {
        logger.error({ token: trimmedToken }, 'Attempted to use development identity adapter in production environment');
        throw new UnauthorizedError('Development identity adapter is disabled in production environment');
      }

      const userId = trimmedToken.startsWith('dev:')
        ? trimmedToken.substring(4)
        : trimmedToken.replace(/^dev_user_/, '');

      if (!userId) {
        throw new UnauthorizedError('Invalid development user token: empty userId');
      }

      logger.warn(
        { userId, adapter: 'DevelopmentUserContextAdapter' },
        '[DEV_ONLY] Authenticated user identity context via development adapter'
      );

      return {
        userContext: {
          userId,
          tenantId: expectedTenantId,
          authenticatedAt: new Date(),
          authMethod: 'dev_adapter',
        },
        isDevAdapterUsed: true,
      };
    }

    // 2. Try Standard JWT Verification (using jsonwebtoken)
    if (trimmedToken.split('.').length === 3 && !trimmedToken.includes(':')) {
      try {
        const decoded = jwt.verify(trimmedToken, tenantSecret, {
          issuer: this.EXPECTED_ISSUER,
          audience: this.EXPECTED_AUDIENCE,
        }) as jwt.JwtPayload;

        const userId = decoded.sub;
        if (!userId || typeof userId !== 'string') {
          throw new UnauthorizedError('Invalid JWT user context token: sub claim is missing');
        }

        // Strict tenant ID match check
        if (decoded.tenantId && expectedTenantId && decoded.tenantId !== expectedTenantId) {
          logger.warn(
            { tokenTenantId: decoded.tenantId, expectedTenantId },
            'Tenant identity mismatch between API key and JWT user token'
          );
          throw new ForbiddenError(
            `Tenant identity mismatch between API key ('${expectedTenantId}') and user token ('${decoded.tenantId}')`
          );
        }

        return {
          userContext: {
            userId,
            tenantId: (decoded.tenantId as string) || expectedTenantId,
            permissions: (decoded.permissions as string[]) || [],
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : undefined,
            authenticatedAt: decoded.iat ? new Date(decoded.iat * 1000) : new Date(),
            authMethod: 'jwt_signed_token',
          },
          isDevAdapterUsed: false,
        };
      } catch (err: any) {
        if (err instanceof ForbiddenError) {
          throw err;
        }
        if (err.name === 'TokenExpiredError') {
          throw new UnauthorizedError('User context token has expired');
        }
        if (err.name === 'JsonWebTokenError') {
          // Fall through to HMAC legacy check if JWT format didn't match standard JWT claims
        } else {
          throw new UnauthorizedError(`User context token validation failed: ${err.message}`);
        }
      }
    }

    // 3. Fallback: HMAC Signed Token Verification (<userId>.<timestamp>.<signature>)
    const parts = trimmedToken.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedError('Invalid user context token format. Expected JWT or <userId>.<timestamp>.<signature>');
    }

    const [userId, timestampStr, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);

    if (isNaN(timestamp)) {
      throw new UnauthorizedError('Invalid timestamp in user context token');
    }

    // Expiry check (token valid for 5 minutes / 300,000 ms)
    const MAX_AGE_MS = 5 * 60 * 1000;
    const now = Date.now();
    if (Math.abs(now - timestamp) > MAX_AGE_MS) {
      throw new UnauthorizedError('User context token has expired or clock drift exceeded limit');
    }

    // Compute expected HMAC signature
    const payload = `${userId}.${timestampStr}`;
    const expectedSignature = crypto
      .createHmac('sha256', tenantSecret)
      .update(payload)
      .digest('hex');

    if (!safeCompare(signature, expectedSignature)) {
      throw new UnauthorizedError('Invalid user context token signature');
    }

    return {
      userContext: {
        userId,
        tenantId: expectedTenantId,
        authenticatedAt: new Date(timestamp),
        authMethod: 'hmac_signed_token',
      },
      isDevAdapterUsed: false,
    };
  }

  /**
   * Helper to generate a valid signed JWT User Context token (useful for customer backend integration & testing).
   */
  public static generateSignedJwtUserToken(
    userId: string,
    tenantId: string,
    tenantSecret: string = 'dev-tenant-secret',
    expiresInSeconds: number = 300
  ): string {
    return jwt.sign(
      {
        sub: userId,
        tenantId,
        permissions: ['passkey:register', 'passkey:authenticate'],
      },
      tenantSecret,
      {
        issuer: this.EXPECTED_ISSUER,
        audience: this.EXPECTED_AUDIENCE,
        expiresIn: expiresInSeconds,
      }
    );
  }
}
