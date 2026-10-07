import { z } from 'zod';

export const generateAuthenticationOptionsSchema = z.object({
  email: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  userName: z.string().trim().optional(),
  assessmentId: z.string().trim().optional(),
  stepUpSessionId: z.string().trim().optional(),
});

export const verifyAuthenticationResponseSchema = z.object({
  email: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  ceremonyId: z.string().min(1, 'ceremonyId is required'),
  response: z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string().min(1),
      authenticatorData: z.string().min(1),
      signature: z.string().min(1),
      userHandle: z.string().optional(),
    }),
    authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
    clientExtensionResults: z.record(z.unknown()).optional(),
  }),
});
