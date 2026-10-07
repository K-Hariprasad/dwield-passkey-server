import { z } from 'zod';

export const initiateStepUpSessionSchema = z.object({
  assessmentId: z.string().trim().min(1, 'assessmentId is required'),
});

export const verifyStepUpTokenSchema = z.object({
  token: z.string().min(1, 'token is required'),
  expectedUserId: z.string().trim().optional(),
  expectedAssessmentId: z.string().trim().optional(),
  expectedStepUpSessionId: z.string().trim().optional(),
});

