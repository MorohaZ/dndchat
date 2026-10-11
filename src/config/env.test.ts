import { describe, it, expect, afterEach } from 'vitest';
import { env, getEnv, resetEnvForTesting, validateEnv } from './env';

describe('Environment Configuration Hardening (env.ts)', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    LINE_CHANNEL_SECRET: 'FAKE_CHANNEL_SECRET_TEST_1234567890',
    LINE_CHANNEL_ACCESS_TOKEN: 'FAKE_CHANNEL_ACCESS_TOKEN_TEST_1234567890',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dndchat',
    REDIS_URL: 'redis://localhost:6379',
  };

  afterEach(() => {
    // Prevent global singleton leak between test suites
    resetEnvForTesting(null);
  });

  it('should validate and parse valid environment with safe defaults', () => {
    const config = validateEnv(validBaseEnv);

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.DATABASE_URL).toBe(
      'postgres://postgres:postgres@localhost:5432/dndchat'
    );
    expect(config.REDIS_URL).toBe('redis://localhost:6379');
    expect(config.REDIS_PASSWORD).toBeUndefined();
    expect(config.LINE_CHANNEL_SECRET).toBe(
      'FAKE_CHANNEL_SECRET_TEST_1234567890'
    );
    expect(config.LINE_CHANNEL_ACCESS_TOKEN).toBe(
      'FAKE_CHANNEL_ACCESS_TOKEN_TEST_1234567890'
    );

    // Distributed lock settings (default 5000ms aligned with original spec)
    expect(config.REDIS_LOCK_TTL_MS).toBe(5000);
    expect(config.REDIS_LOCK_RETRY_COUNT).toBe(3);
    expect(config.REDIS_LOCK_RETRY_DELAY_MS).toBe(200);

    // Rate limits aligned with Task 1.7 spec
    expect(config.RATE_LIMIT_USER_MESSAGES_MAX).toBe(1);
    expect(config.RATE_LIMIT_USER_MESSAGES_WINDOW_MS).toBe(2000);
    expect(config.RATE_LIMIT_GROUP_MESSAGES_MAX).toBe(10);
    expect(config.RATE_LIMIT_GROUP_MESSAGES_WINDOW_MS).toBe(10000);
  });

  it('should convert empty or missing REDIS_PASSWORD to undefined', () => {
    const envEmptyPass = validateEnv({
      ...validBaseEnv,
      REDIS_PASSWORD: '',
    });
    expect(envEmptyPass.REDIS_PASSWORD).toBeUndefined();

    const envWithPass = validateEnv({
      ...validBaseEnv,
      REDIS_PASSWORD: 'DUMMY_REDIS_AUTH_PW',
    });
    expect(envWithPass.REDIS_PASSWORD).toBe('DUMMY_REDIS_AUTH_PW');
  });

  it('should forbid default credentials and require explicit DATABASE_URL/REDIS_URL in production', () => {
    // Production with default localhost credentials must fail
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dndchat',
      })
    ).toThrowError(/Default development credentials or loopback database cannot be used in production/);

    // Production with default 127.0.0.1 credentials must fail
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5432/dndchat',
      })
    ).toThrowError(/Default development credentials or loopback database cannot be used in production/);

    // Production with default REDIS_URL must fail
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://dnd_prod:DUMMY_PROD_PW@db.internal:5432/dnd_prod',
        REDIS_URL: 'redis://localhost:6379',
      })
    ).toThrowError(/Default development REDIS_URL cannot be used in production/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://dnd_prod:DUMMY_PROD_PW@db.internal:5432/dnd_prod',
        REDIS_URL: 'redis://127.0.0.1:6379',
      })
    ).toThrowError(/Default development REDIS_URL cannot be used in production/);

    // Production without DATABASE_URL must fail
    const { DATABASE_URL: _omittedDb, ...noDbEnv } = validBaseEnv;
    expect(() =>
      validateEnv({
        ...noDbEnv,
        NODE_ENV: 'production',
      })
    ).toThrowError(/DATABASE_URL is required in production environment/);

    // Production with valid explicit credentials must succeed
    const prodConfig = validateEnv({
      ...validBaseEnv,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://dnd_prod:DUMMY_PROD_PW@db.internal:5432/dnd_prod',
      REDIS_URL: 'redis://cache.internal:6379',
    });
    expect(prodConfig.NODE_ENV).toBe('production');
    expect(prodConfig.DATABASE_URL).toBe(
      'postgres://dnd_prod:DUMMY_PROD_PW@db.internal:5432/dnd_prod'
    );
    expect(prodConfig.REDIS_URL).toBe('redis://cache.internal:6379');
  });

  it('should fall back to safe defaults when DATABASE_URL or REDIS_URL are empty strings in test/dev', () => {
    const config = validateEnv({
      ...validBaseEnv,
      DATABASE_URL: '',
      REDIS_URL: '',
    });
    expect(config.DATABASE_URL).toBe('postgres://postgres:postgres@localhost:5432/dndchat');
    expect(config.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('should throw with descriptive errors when required variables are completely missing', () => {
    expect(() => validateEnv({})).toThrowError(/LINE_CHANNEL_SECRET/);
    expect(() => validateEnv({})).toThrowError(/LINE_CHANNEL_ACCESS_TOKEN/);
  });

  it('should throw when LINE_CHANNEL_SECRET is missing, too short, or has whitespace', () => {
    const { LINE_CHANNEL_SECRET: _omitted, ...missingSecretEnv } = validBaseEnv;
    expect(() => validateEnv(missingSecretEnv)).toThrowError(
      /LINE_CHANNEL_SECRET/
    );

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        LINE_CHANNEL_SECRET: 'short',
      })
    ).toThrowError(/LINE_CHANNEL_SECRET/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        LINE_CHANNEL_SECRET: 'secret with whitespace 12345',
      })
    ).toThrowError(/LINE_CHANNEL_SECRET/);
  });

  it('should throw when LINE_CHANNEL_ACCESS_TOKEN is missing, too short, or has whitespace', () => {
    const { LINE_CHANNEL_ACCESS_TOKEN: _omitted, ...missingTokenEnv } = validBaseEnv;
    expect(() => validateEnv(missingTokenEnv)).toThrowError(
      /LINE_CHANNEL_ACCESS_TOKEN/
    );

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        LINE_CHANNEL_ACCESS_TOKEN: 'short_token',
      })
    ).toThrowError(/LINE_CHANNEL_ACCESS_TOKEN/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        LINE_CHANNEL_ACCESS_TOKEN: 'token with spaces 1234567890',
      })
    ).toThrowError(/LINE_CHANNEL_ACCESS_TOKEN/);
  });

  it('should reject invalid REDIS_URL format', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        REDIS_URL: 'not-a-valid-redis-url',
      })
    ).toThrowError(/REDIS_URL/);
  });

  it('should reject non-integer, non-numeric, or out-of-range PORT values', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        PORT: 'abc',
      })
    ).toThrowError(/PORT/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        PORT: '1.5',
      })
    ).toThrowError(/PORT/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        PORT: '0',
      })
    ).toThrowError(/PORT/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        PORT: '70000',
      })
    ).toThrowError(/PORT/);
  });

  it('should reject unknown NODE_ENV values', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'staging_unknown',
      })
    ).toThrowError(/NODE_ENV/);
  });

  it('should enforce upper bounds on lock TTL and rate limits', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        REDIS_LOCK_TTL_MS: '70000', // exceeds max 60000
      })
    ).toThrowError(/REDIS_LOCK_TTL_MS/);

    expect(() =>
      validateEnv({
        ...validBaseEnv,
        RATE_LIMIT_GLOBAL_MAX: '20000', // exceeds max 10000
      })
    ).toThrowError(/RATE_LIMIT_GLOBAL_MAX/);
  });

  it('should sanitize error output and NEVER leak raw user secret values', () => {
    const rawSecretAttempt = 'SUPER_SECRET_LEAK_PLAINTEXT_VALUE_99999';
    let caughtError: Error | null = null;

    try {
      validateEnv({
        ...validBaseEnv,
        LINE_CHANNEL_SECRET: `invalid spaces ${rawSecretAttempt}`,
      });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError).not.toBeNull();
    // Must contain error indication without containing the raw secret string
    expect(caughtError!.message).toContain('LINE_CHANNEL_SECRET');
    expect(caughtError!.message).not.toContain(rawSecretAttempt);
  });

  it('should support resetEnvForTesting and lazy proxy property access cleanly', () => {
    resetEnvForTesting(null);
    const mockConfig = validateEnv(validBaseEnv);
    resetEnvForTesting(mockConfig);

    expect(getEnv().PORT).toBe(3000);
    expect(env.PORT).toBe(3000);
    expect(env.LINE_CHANNEL_SECRET).toBe(
      'FAKE_CHANNEL_SECRET_TEST_1234567890'
    );
    expect('PORT' in env).toBe(true);
    expect(Object.keys(env)).toContain('PORT');

    resetEnvForTesting(null);
  });
});
