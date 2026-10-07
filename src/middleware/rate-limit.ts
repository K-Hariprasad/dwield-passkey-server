import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export const ceremonyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 30, // Limit each IP/tenant to 30 ceremony requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Group rate limiting by Tenant ID if present, otherwise IP address
    return req.tenant?.tenantId ? `tenant_${req.tenant.tenantId}` : req.ip || 'unknown_ip';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many passkey ceremony requests. Please try again later.',
      },
    });
  },
});
