import { z } from 'zod';

export const generateRegistrationOptionsSchema = z.object({
  email: z.string().trim().optional(),
  userName: z.string().trim().optional(),
  userDisplayName: z.string().trim().optional(),
});

export const verifyRegistrationResponseSchema = z.object({
  email: z.string().trim().optional(),
  ceremonyId: z.string().min(1, 'ceremonyId is required'),
  friendlyName: z.string().trim().optional(),
  response: z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string().min(1),
      attestationObject: z.string().min(1),
      transports: z.array(z.string()).optional(),
      authenticatorData: z.string().optional(),
      publicKeyAlgorithm: z.number().optional(),
      publicKey: z.string().optional(),
    }),
    authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
    clientExtensionResults: z.record(z.unknown()).optional(),
  }),
});
