import { describe, it, expect } from 'vitest';
import {
  logger,
  baseLogger,
  createLogger,
  defaultRedactPaths,
  runWithCorrelationContext,
  getCorrelationId,
  getLogContext,
  createChildLogger,
} from './logger';

describe('Structured Logger (logger.ts)', () => {
  it('should export baseLogger and logger instances with standard methods', () => {
    expect(logger).toBeDefined();
    expect(baseLogger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should provide correlationId within runWithCorrelationContext', async () => {
    expect(getCorrelationId()).toBeUndefined();
    expect(getLogContext()).toBeUndefined();

    const testId = 'corr-abc-123-xyz';
    await runWithCorrelationContext({ correlationId: testId, userId: 'user-42' }, async () => {
      expect(getCorrelationId()).toBe(testId);
      const context = getLogContext();
      expect(context).toBeDefined();
      expect(context?.correlationId).toBe(testId);
      expect(context?.userId).toBe('user-42');
    });

    // Context is cleared outside scope
    expect(getCorrelationId()).toBeUndefined();
    expect(getLogContext()).toBeUndefined();
  });

  it('should allow nested contexts while preserving the inner context', async () => {
    await runWithCorrelationContext({ correlationId: 'outer' }, async () => {
      expect(getCorrelationId()).toBe('outer');

      await runWithCorrelationContext({ correlationId: 'inner' }, async () => {
        expect(getCorrelationId()).toBe('inner');
      });

      expect(getCorrelationId()).toBe('outer');
    });
  });

  it('should create child logger with attached bindings', () => {
    const child = createChildLogger({ module: 'dice-engine', gameSessionId: 'sess-99' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
  });

  it('should inject correlationId into actual serialized log output', async () => {
    const logs: string[] = [];
    const stream = {
      write(chunk: string) {
        logs.push(chunk);
        return true;
      },
    };

    const testLogger = createLogger({ level: 'info' }, stream as any);

    await runWithCorrelationContext({ correlationId: 'test-corr-999', userId: 'user-dnd' }, async () => {
      testLogger.info({ action: 'roll_dice', sides: 20 }, 'Dice rolled');
    });

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(parsed.correlationId).toBe('test-corr-999');
    expect(parsed.userId).toBe('user-dnd');
    expect(parsed.action).toBe('roll_dice');
    expect(parsed.sides).toBe(20);
    expect(parsed.msg).toBe('Dice rolled');
  });

  it('should redact sensitive credentials and tokens from log output', () => {
    const logs: string[] = [];
    const stream = {
      write(chunk: string) {
        logs.push(chunk);
        return true;
      },
    };

    const testLogger = createLogger({ level: 'info' }, stream as any);

    testLogger.info(
      {
        authorization: 'Bearer line_secret_token_123',
        password: 'db_password_456',
        token: 'auth_token_789',
        LINE_CHANNEL_SECRET: 'line_channel_secret_val',
        lineChannelSecret: 'line_camel_secret_val',
        nested: {
          authorization: 'Bearer nested_auth',
          password: 'nested_pass',
          DATABASE_URL: 'postgres://postgres:pass@localhost:5432/dndchat',
        },
        publicField: 'safe_to_log',
      },
      'Sensitives test'
    );

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);

    // Redacted fields should be removed
    expect(parsed.authorization).toBeUndefined();
    expect(parsed.password).toBeUndefined();
    expect(parsed.token).toBeUndefined();
    expect(parsed.LINE_CHANNEL_SECRET).toBeUndefined();
    expect(parsed.lineChannelSecret).toBeUndefined();
    expect(parsed.nested.authorization).toBeUndefined();
    expect(parsed.nested.password).toBeUndefined();
    expect(parsed.nested.DATABASE_URL).toBeUndefined();

    // Public fields should remain
    expect(parsed.publicField).toBe('safe_to_log');
    expect(parsed.msg).toBe('Sensitives test');
  });
});

