import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // PostgreSQL
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://postgres:postgres@localhost:5432/dndchat'),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('postgres'),
  POSTGRES_DB: z.string().default('dndchat'),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // Distributed Lock
  REDIS_LOCK_TTL_MS: z.coerce.number().int().positive().default(10000),
  REDIS_LOCK_RETRY_COUNT: z.coerce.number().int().min(0).default(3),
  REDIS_LOCK_RETRY_DELAY_MS: z.coerce.number().int().positive().default(200),

  // LINE Messaging API Secrets
  LINE_CHANNEL_SECRET: z
    .string()
    .min(10, 'LINE_CHANNEL_SECRET must be at least 10 characters long'),
  LINE_CHANNEL_ACCESS_TOKEN: z
    .string()
    .min(10, 'LINE_CHANNEL_ACCESS_TOKEN must be at least 10 characters long'),

  // Rate Limiting (All rate limits must be configured, not hardcoded)
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WEBHOOK_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_USER_MESSAGES_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_USER_MESSAGES_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_DICE_ROLLS_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_DICE_ROLLS_WINDOW_MS: z.coerce.number().int().positive().default(60000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates given environment variables dictionary against schema.
 * Throws a formatted Error with issues if validation fails.
 */
export function validateEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `[CONFIG_ERROR] Invalid environment configuration:\n${errorMessages}`
    );
  }

  return result.data;
}

export { envSchema };

let cachedEnv: Env | null = null;

/**
 * Returns the validated environment configuration singleton.
 * Validates process.env on first call and caches the result.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}

/**
 * Resets or overrides the cached environment configuration for testing.
 */
export function resetEnvForTesting(mockEnv: Env | null = null): void {
  cachedEnv = mockEnv;
}

/**
 * Global parsed env instance accessed lazily via Proxy.
 * Prevents premature validation errors at import time during testing.
 */
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

