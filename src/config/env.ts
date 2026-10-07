import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .union([z.string(), z.number()])
    .transform((val) => (typeof val === 'number' ? val : parseInt(val, 10)))
    .pipe(z.number().positive().max(65535))
    .default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required').default('mongodb://localhost:27017/dwield-passkey'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,http://localhost:5173,https://dwield-auth-lab.vercel.app'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
    throw new Error('Environment validation failed');
  }

  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
