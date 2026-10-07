import crypto from 'crypto';

/**
 * Computes SHA-256 hash of a string (e.g., raw API key).
 */
export const hashApiKey = (rawKey: string): string => {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
};

/**
 * Generates a secure high-entropy API key and its keyId.
 * Format: dw_live_<32 hex chars> or dw_dev_<32 hex chars>
 */
export const generateApiKey = (type: 'publishable' | 'secret' = 'publishable', envPrefix: 'live' | 'dev' = 'dev') => {
  const randomBytes = crypto.randomBytes(24).toString('hex'); // 48 chars
  const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;
  const rawKey = `dw_${envPrefix}_${type === 'publishable' ? 'pub' : 'sec'}_${randomBytes}`;
  const keyHash = hashApiKey(rawKey);

  return {
    keyId,
    rawKey,
    keyHash,
  };
};

/**
 * Secure constant-time string comparison to prevent timing attacks.
 */
export const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};
