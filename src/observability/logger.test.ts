import { describe, it, expect } from 'vitest';
import {
  logger,
  baseLogger,
  createLogger,
  runWithCorrelationContext,
  getCorrelationId,
  getLogContext,
  createChildLogger,
  resolveLogLevel,
  sanitizeErrorMessage,
  sanitizeError,
  sanitizeWebhookEventForLog,
} from './logger';

describe('Structured Logger Hardening (logger.ts)', () => {
  it('should export baseLogger and logger instances with standard methods', () => {
    expect(logger).toBeDefined();
    expect(baseLogger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should provide correlationId within runWithCorrelationContext and clear outside', async () => {
    expect(getCorrelationId()).toBeUndefined();
    expect(getLogContext()).toBeUndefined();

    const testId = 'corr-abc-123-xyz';
    await runWithCorrelationContext(
      { correlationId: testId, userId: 'user-42' },
      async () => {
        expect(getCorrelationId()).toBe(testId);
        const context = getLogContext();
        expect(context).toBeDefined();
        expect(context?.correlationId).toBe(testId);
        expect(context?.userId).toBe('user-42');
      }
    );

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
    const child = createChildLogger({
      module: 'dice-engine',
      gameSessionId: 'sess-99',
    });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
  });

  it('should inject correlationId into actual serialized log output and context MUST win over caller object', async () => {
    const logs: string[] = [];
    const stream = {
      write(chunk: string) {
        logs.push(chunk);
        return true;
      },
    };

    const testLogger = createLogger({ level: 'info' }, stream as any);

    await runWithCorrelationContext(
      { correlationId: 'verified-system-corr-id', userId: 'user-dnd' },
      async () => {
        // Attempting to overwrite correlationId from caller object
        testLogger.info(
          {
            correlationId: 'malicious-spoofed-corr-id',
            action: 'roll_dice',
            sides: 20,
          },
          'Dice rolled'
        );
      }
    );

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);
    // System context MUST override caller-supplied correlationId
    expect(parsed.correlationId).toBe('verified-system-corr-id');
    expect(parsed.userId).toBe('user-dnd');
    expect(parsed.action).toBe('roll_dice');
    expect(parsed.sides).toBe(20);
    expect(parsed.msg).toBe('Dice rolled');
  });

  it('should redact sensitive credentials, tokens, cookies, and LINE headers at multiple nesting levels', () => {
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
        authorization: 'Bearer DUMMY_LINE_SECRET_TOKEN_123',
        password: 'DUMMY_DB_PASSWORD_456',
        token: 'DUMMY_AUTH_TOKEN_789',
        cookie: 'sessionId=DUMMY_COOKIE_VALUE_123',
        'set-cookie': 'remember=DUMMY_SET_COOKIE_VALUE',
        'x-line-signature': 'DUMMY_LINE_HMAC_SIGNATURE_XYZ',
        channelSecret: 'DUMMY_CHANNEL_SECRET_VAL',
        replyToken: 'DUMMY_REPLY_TOKEN_456',
        idToken: 'DUMMY_ID_TOKEN_789',
        LINE_CHANNEL_SECRET: 'DUMMY_LINE_CHANNEL_SECRET_VAL',
        lineChannelSecret: 'DUMMY_LINE_CAMEL_SECRET_VAL',
        nested: {
          authorization: 'Bearer DUMMY_NESTED_AUTH',
          password: 'DUMMY_NESTED_PASS',
          DATABASE_URL: 'postgres://postgres:pass@localhost:5432/dndchat',
          'x-line-signature': 'DUMMY_NESTED_SIG',
          cookie: 'DUMMY_NESTED_COOKIE',
        },
        publicField: 'safe_to_log',
      },
      'Sensitives test'
    );

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);

    // Top-level redactions
    expect(parsed.authorization).toBeUndefined();
    expect(parsed.password).toBeUndefined();
    expect(parsed.token).toBeUndefined();
    expect(parsed.cookie).toBeUndefined();
    expect(parsed['set-cookie']).toBeUndefined();
    expect(parsed['x-line-signature']).toBeUndefined();
    expect(parsed.channelSecret).toBeUndefined();
    expect(parsed.replyToken).toBeUndefined();
    expect(parsed.idToken).toBeUndefined();
    expect(parsed.LINE_CHANNEL_SECRET).toBeUndefined();
    expect(parsed.lineChannelSecret).toBeUndefined();

    // Nested redactions
    expect(parsed.nested.authorization).toBeUndefined();
    expect(parsed.nested.password).toBeUndefined();
    expect(parsed.nested.DATABASE_URL).toBeUndefined();
    expect(parsed.nested['x-line-signature']).toBeUndefined();
    expect(parsed.nested.cookie).toBeUndefined();

    // Public fields preserved
    expect(parsed.publicField).toBe('safe_to_log');
    expect(parsed.msg).toBe('Sensitives test');
  });

  it('should sanitize database and redis passwords from error messages and stacks', () => {
    const rawError = new Error(
      'Connection failed to postgres://app_user:SUPER_SECRET_DB_PASS@db.internal:5432/dndchat and redis://:SUPER_SECRET_REDIS_PASS@redis.internal:6379'
    );

    const sanitizedMsg = sanitizeErrorMessage(rawError.message);
    expect(sanitizedMsg).not.toContain('SUPER_SECRET_DB_PASS');
    expect(sanitizedMsg).not.toContain('SUPER_SECRET_REDIS_PASS');
    expect(sanitizedMsg).toContain('postgres://app_user:***@db.internal:5432/dndchat');
    expect(sanitizedMsg).toContain('redis://:***@redis.internal:6379');

    const sanitizedErr = sanitizeError(rawError) as Error;
    expect(sanitizedErr.message).not.toContain('SUPER_SECRET_DB_PASS');
    expect(sanitizedErr.message).toContain('***@');
  });

  it('should validate and safely fallback LOG_LEVEL without crashing on invalid inputs', () => {
    expect(resolveLogLevel('debug')).toBe('debug');
    expect(resolveLogLevel('ERROR')).toBe('error');
    expect(resolveLogLevel('info')).toBe('info');
    // Invalid log levels fallback safely
    expect(resolveLogLevel('invalid_level_xyz')).toBe('silent'); // test env default
  });

  it('should sanitize webhook event to prevent logging raw chat messages or PII', () => {
    const rawWebhookEvent = {
      type: 'message',
      mode: 'active',
      timestamp: 1625097600000,
      source: {
        type: 'user',
        userId: 'U1234567890abcdef',
      },
      webhookEventId: '01FZ73CS5G7VM97BKP4B',
      deliveryContext: {
        isRedelivery: false,
      },
      message: {
        id: '325708',
        type: 'text',
        text: 'Hello DM, my real personal name is John Doe and my phone is 0812345678',
      },
      replyToken: 'DUMMY_REPLY_TOKEN_SECRET_999',
    };

    const safeLogData = sanitizeWebhookEventForLog(rawWebhookEvent);

    expect(safeLogData.eventId).toBe('01FZ73CS5G7VM97BKP4B');
    expect(safeLogData.eventType).toBe('message');
    expect(safeLogData.messageType).toBe('text');
    expect(safeLogData.messageLength).toBe(
      rawWebhookEvent.message.text.length
    );
    expect(safeLogData.sourceType).toBe('user');

    // Verify raw user text and replyToken are NOT present in safe log data
    expect((safeLogData as any).text).toBeUndefined();
    expect((safeLogData as any).replyToken).toBeUndefined();
    expect(JSON.stringify(safeLogData)).not.toContain('John Doe');
  });
});
