import { describe, it, expect } from 'vitest';
import { env, getEnv, resetEnvForTesting, validateEnv } from './env';

describe('Environment Configuration (env.ts)', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    LINE_CHANNEL_SECRET: 'test_secret_1234567890',
    LINE_CHANNEL_ACCESS_TOKEN: 'test_token_1234567890',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dndchat',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('should validate and parse valid environment variables with default values', () => {
    const config = validateEnv(validBaseEnv);

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.DATABASE_URL).toBe(
      'postgres://postgres:postgres@localhost:5432/dndchat'
    );
    expect(config.REDIS_URL).toBe('redis://localhost:6379');
    expect(config.LINE_CHANNEL_SECRET).toBe('test_secret_1234567890');
    expect(config.LINE_CHANNEL_ACCESS_TOKEN).toBe('test_token_1234567890');

    // Default rate limit configurations
    expect(config.RATE_LIMIT_GLOBAL_MAX).toBe(100);
    expect(config.RATE_LIMIT_GLOBAL_WINDOW_MS).toBe(60000);
    expect(config.RATE_LIMIT_WEBHOOK_MAX).toBe(60);
    expect(config.RATE_LIMIT_WEBHOOK_WINDOW_MS).toBe(60000);
    expect(config.RATE_LIMIT_USER_MESSAGES_MAX).toBe(10);
    expect(config.RATE_LIMIT_USER_MESSAGES_WINDOW_MS).toBe(60000);
    expect(config.RATE_LIMIT_DICE_ROLLS_MAX).toBe(30);
    expect(config.RATE_LIMIT_DICE_ROLLS_WINDOW_MS).toBe(60000);

    // Distributed lock settings
    expect(config.REDIS_LOCK_TTL_MS).toBe(10000);
    expect(config.REDIS_LOCK_RETRY_COUNT).toBe(3);
    expect(config.REDIS_LOCK_RETRY_DELAY_MS).toBe(200);
  });

  it('should coerce string numbers to integer types properly', () => {
    const customEnv = {
      ...validBaseEnv,
      PORT: '8080',
      RATE_LIMIT_GLOBAL_MAX: '250',
      RATE_LIMIT_GLOBAL_WINDOW_MS: '30000',
      RATE_LIMIT_WEBHOOK_MAX: '120',
      RATE_LIMIT_DICE_ROLLS_MAX: '50',
      REDIS_LOCK_TTL_MS: '15000',
    };

    const config = validateEnv(customEnv);

    expect(config.PORT).toBe(8080);
    expect(config.RATE_LIMIT_GLOBAL_MAX).toBe(250);
    expect(config.RATE_LIMIT_GLOBAL_WINDOW_MS).toBe(30000);
    expect(config.RATE_LIMIT_WEBHOOK_MAX).toBe(120);
    expect(config.RATE_LIMIT_DICE_ROLLS_MAX).toBe(50);
    expect(config.REDIS_LOCK_TTL_MS).toBe(15000);
  });

  it('should throw an error when LINE_CHANNEL_SECRET is missing or too short', () => {
    const invalidEnv = {
      ...validBaseEnv,
      LINE_CHANNEL_SECRET: 'short',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(
      /LINE_CHANNEL_SECRET must be at least 10 characters long/
    );
  });

  it('should throw an error when DATABASE_URL is not a valid URL', () => {
    const invalidEnv = {
      ...validBaseEnv,
      DATABASE_URL: 'invalid-url-string',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/DATABASE_URL/);
  });

  it('should throw an error when PORT is non-positive or negative', () => {
    const invalidEnv = {
      ...validBaseEnv,
      PORT: '-10',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/PORT/);
  });

  it('should throw an error when rate limit values are negative or zero', () => {
    const invalidEnv = {
      ...validBaseEnv,
      RATE_LIMIT_USER_MESSAGES_MAX: '0',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(
      /RATE_LIMIT_USER_MESSAGES_MAX/
    );
  });

  it('should support resetEnvForTesting and lazy proxy property access', () => {
    resetEnvForTesting(null);
    const mockConfig = validateEnv(validBaseEnv);
    resetEnvForTesting(mockConfig);

    expect(getEnv().PORT).toBe(3000);
    expect(env.PORT).toBe(3000);
    expect(env.LINE_CHANNEL_SECRET).toBe('test_secret_1234567890');
    expect('PORT' in env).toBe(true);
    expect(Object.keys(env)).toContain('PORT');

    // Clean up reset
    resetEnvForTesting(null);
  });
});

