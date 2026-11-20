import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // PostgreSQL
    DATABASE_URL: z
      .string()
      .url()
      .default('postgres://postgres:postgres@localhost:5433/customer_import_db'),
    DB_MAX_CONNECTIONS: z.coerce.number().int().positive().default(20),

    // Redis
    REDIS_URL: z.string().url().default('redis://localhost:6380'),

    // Upload limits
    UPLOAD_DIR: z.string().default('./uploads'),
    MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(524288000), // 500 MB

    // Application settings
    API_KEY: z.string().min(1).default('test-api-key-12345'),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    BATCH_SIZE: z.coerce.number().int().positive().default(2000),
  })
  .superRefine((data, ctx) => {
    // Fail-fast guard in production: prevent insecure defaults
    if (data.NODE_ENV === 'production') {
      if (data.API_KEY === 'test-api-key-12345') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Production API_KEY must be set to a secure secret and cannot use the development default',
          path: ['API_KEY'],
        });
      }
      if (data.DATABASE_URL.includes('localhost') || data.DATABASE_URL.includes('127.0.0.1')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Production DATABASE_URL cannot point to localhost',
          path: ['DATABASE_URL'],
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = z.infer<typeof envSchema>;
