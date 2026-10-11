import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bootstrap } from './index';
import * as envModule from './config/env';

describe('Application Bootstrap Fail-Fast (index.ts)', () => {
  let exitSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('PROCESS_EXIT_CALLED');
    }) as any);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fail-fast and exit process with code 1 when env validation fails', async () => {
    vi.spyOn(envModule, 'getEnv').mockImplementation(() => {
      throw new Error('[CONFIG_ERROR] Invalid environment configuration:\n  - LINE_CHANNEL_SECRET: Validation failed');
    });

    await expect(bootstrap()).rejects.toThrow('PROCESS_EXIT_CALLED');

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorOutput = consoleErrorSpy.mock.calls[0].join(' ');
    expect(errorOutput).toContain('Startup configuration validation failed');
    expect(errorOutput).toContain('LINE_CHANNEL_SECRET');
  });

  it('should sanitize credentials from startup error before printing to stderr', async () => {
    vi.spyOn(envModule, 'getEnv').mockImplementation(() => {
      throw new Error('Failed to connect to postgres://app_user:SUPER_SECRET_LEAK@localhost:5432/dnd');
    });

    await expect(bootstrap()).rejects.toThrow('PROCESS_EXIT_CALLED');

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = consoleErrorSpy.mock.calls[0].join(' ');
    expect(errorOutput).not.toContain('SUPER_SECRET_LEAK');
    expect(errorOutput).toContain('postgres://app_user:***@localhost:5432/dnd');
  });

  it('should initialize and return config successfully when env is valid', async () => {
    const mockEnv = {
      NODE_ENV: 'test' as const,
      PORT: 3000,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info' as const,
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/dndchat',
      REDIS_URL: 'redis://localhost:6379',
      REDIS_PASSWORD: undefined,
      REDIS_LOCK_TTL_MS: 5000,
      REDIS_LOCK_RETRY_COUNT: 3,
      REDIS_LOCK_RETRY_DELAY_MS: 200,
      LINE_CHANNEL_SECRET: 'FAKE_CHANNEL_SECRET_TEST_1234567890',
      LINE_CHANNEL_ACCESS_TOKEN: 'FAKE_CHANNEL_ACCESS_TOKEN_TEST_1234567890',
      RATE_LIMIT_GLOBAL_MAX: 100,
      RATE_LIMIT_GLOBAL_WINDOW_MS: 60000,
      RATE_LIMIT_WEBHOOK_MAX: 60,
      RATE_LIMIT_WEBHOOK_WINDOW_MS: 60000,
      RATE_LIMIT_USER_MESSAGES_MAX: 1,
      RATE_LIMIT_USER_MESSAGES_WINDOW_MS: 2000,
      RATE_LIMIT_GROUP_MESSAGES_MAX: 10,
      RATE_LIMIT_GROUP_MESSAGES_WINDOW_MS: 10000,
      RATE_LIMIT_DICE_ROLLS_MAX: 30,
      RATE_LIMIT_DICE_ROLLS_WINDOW_MS: 60000,
    };

    vi.spyOn(envModule, 'getEnv').mockReturnValue(mockEnv as any);

    const result = await bootstrap();
    expect(result).toBeDefined();
    expect(result.PORT).toBe(3000);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
