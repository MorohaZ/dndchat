import dotenv from 'dotenv';
import { z } from 'zod';

let dotenvLoaded = false;

/**
 * Loads .env configuration file.
 * Skips loading when NODE_ENV is 'test' to prevent tests from reading local secret files.
 */
export function loadDotenv(): void {
  if (dotenvLoaded) return;
  if (process.env.NODE_ENV !== 'test') {
    dotenv.config();
  }
  dotenvLoaded = true;
}

const baseSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce
    .number({ invalid_type_error: 'PORT must be a valid number' })
    .int('PORT must be an integer')
    .min(1, 'PORT must be between 1 and 65535')
    .max(65535, 'PORT must be between 1 and 65535')
    .default(3000),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // PostgreSQL connection URL (Single Source of Truth)
  DATABASE_URL: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().url('DATABASE_URL must be a valid URL').optional()
  ),

  // Redis connection URL (Single Source of Truth)
  REDIS_URL: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().url('REDIS_URL must be a valid URL').optional()
  ),
  REDIS_PASSWORD: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val.trim() === '') {
        return undefined;
      }
      return val;
    }),

  // Distributed Lock
  REDIS_LOCK_TTL_MS: z.coerce
    .number()
    .int()
    .min(100, 'REDIS_LOCK_TTL_MS must be at least 100ms')
    .max(60000, 'REDIS_LOCK_TTL_MS must not exceed 60000ms')
    .default(5000),
  REDIS_LOCK_RETRY_COUNT: z.coerce
    .number()
    .int()
    .min(0, 'REDIS_LOCK_RETRY_COUNT cannot be negative')
    .max(10, 'REDIS_LOCK_RETRY_COUNT must not exceed 10')
    .default(3),
  REDIS_LOCK_RETRY_DELAY_MS: z.coerce
    .number()
    .int()
    .min(10, 'REDIS_LOCK_RETRY_DELAY_MS must be at least 10ms')
    .max(2000, 'REDIS_LOCK_RETRY_DELAY_MS must not exceed 2000ms')
    .default(200),

  // LINE Messaging API Secrets
  LINE_CHANNEL_SECRET: z
    .string({ required_error: 'LINE_CHANNEL_SECRET is required' })
    .min(16, 'LINE_CHANNEL_SECRET must be at least 16 characters')
    .max(256, 'LINE_CHANNEL_SECRET exceeds maximum allowed length')
    .regex(/^[^\s]+$/, 'LINE_CHANNEL_SECRET must not contain whitespace'),
  LINE_CHANNEL_ACCESS_TOKEN: z
    .string({ required_error: 'LINE_CHANNEL_ACCESS_TOKEN is required' })
    .min(20, 'LINE_CHANNEL_ACCESS_TOKEN must be at least 20 characters')
    .regex(/^[^\s]+$/, 'LINE_CHANNEL_ACCESS_TOKEN must not contain whitespace'),

  // Rate Limiting (All rates are configurable with upper bounds)
  RATE_LIMIT_GLOBAL_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(100),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(60000),

  RATE_LIMIT_WEBHOOK_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(5000)
    .default(60),
  RATE_LIMIT_WEBHOOK_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(60000),

  // User Rate Limit (Task 1.7: 1 command per 2 seconds)
  RATE_LIMIT_USER_MESSAGES_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(1),
  RATE_LIMIT_USER_MESSAGES_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(86400000)
    .default(2000),

  // Group Rate Limit (Task 1.7: 10 commands per 10 seconds)
  RATE_LIMIT_GROUP_MESSAGES_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(10),
  RATE_LIMIT_GROUP_MESSAGES_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(10000),

  // Dice Rolls Rate Limit
  RATE_LIMIT_DICE_ROLLS_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(30),
  RATE_LIMIT_DICE_ROLLS_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(86400000)
    .default(60000),
});

export const envSchema = baseSchema
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL is required in production environment',
        });
      } else if (
        data.DATABASE_URL.includes('postgres:postgres@') ||
        data.DATABASE_URL.includes('@localhost') ||
        data.DATABASE_URL.includes('@127.0.0.1')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message:
            'Default development credentials or loopback database cannot be used in production',
        });
      }

      if (!data.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL is required in production environment',
        });
      } else if (
        data.REDIS_URL === 'redis://localhost:6379' ||
        data.REDIS_URL === 'redis://127.0.0.1:6379'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message:
            'Default development REDIS_URL cannot be used in production',
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    DATABASE_URL:
      data.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/dndchat',
    REDIS_URL: data.REDIS_URL ?? 'redis://localhost:6379',
  }));

export type Env = z.infer<typeof envSchema>;

const SENSITIVE_FIELDS = new Set([
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'DATABASE_URL',
  'REDIS_URL',
  'REDIS_PASSWORD',
]);

/**
 * Validates given environment variables dictionary against schema.
 * Throws a sanitized Error that never echoes raw secret values.
 */
export function validateEnv(rawEnv: Record<string, unknown> = process.env): Env {
  if (rawEnv === process.env) {
    loadDotenv();
  }

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => {
        const fieldName = issue.path.join('.');
        if (SENSITIVE_FIELDS.has(fieldName)) {
          return `  - ${fieldName}: Validation failed for sensitive parameter (${issue.message})`;
        }
        return `  - ${fieldName}: ${issue.message}`;
      })
      .join('\n');

    throw new Error(
      `[CONFIG_ERROR] Invalid environment configuration:\n${errorMessages}`
    );
  }

  return result.data;
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}

export function resetEnvForTesting(mockEnv: Env | null = null): void {
  cachedEnv = mockEnv;
  dotenvLoaded = false;
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    return (getEnv() as unknown as Record<string | symbol, unknown>)[prop];
  },
  has(_target, prop: string | symbol) {
    return prop in getEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(getEnv());
  },
  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    return Reflect.getOwnPropertyDescriptor(getEnv(), prop);
  },
});
