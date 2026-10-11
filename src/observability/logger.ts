import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { Logger, LoggerOptions } from 'pino';

// Context stored across async execution chain
export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  source?: string;
  [key: string]: unknown;
}

// AsyncLocalStorage to maintain correlation ID across async hops
export const logContextStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext | undefined {
  return logContextStorage.getStore();
}

export function getCorrelationId(): string | undefined {
  return logContextStorage.getStore()?.correlationId;
}

export function runWithCorrelationContext<T>(
  context: LogContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return logContextStorage.run(context, fn);
}

/**
 * Pino fast-redact limitation note:
 * Pino's underlying fast-redact engine does NOT support arbitrary recursive wildcards (e.g. '**').
 * Each wildcard '*' matches exactly one path segment depth.
 * Therefore, paths are specified up to 3 levels deep. Any deeply nested or dynamic structures
 * must be pre-sanitized before logging.
 */
export const defaultRedactPaths = [
  // HTTP Auth & Cookies
  'authorization',
  '*.authorization',
  '*.*.authorization',
  'headers.authorization',
  '*.headers.authorization',
  'req.headers.authorization',
  '*.req.headers.authorization',

  'cookie',
  '*.cookie',
  '*.*.cookie',
  'headers.cookie',
  '*.headers.cookie',
  'headers["cookie"]',
  '*.headers["cookie"]',
  'req.headers.cookie',
  '*.req.headers.cookie',
  'req.headers["cookie"]',
  '*.req.headers["cookie"]',

  'set-cookie',
  '*.set-cookie',
  '*.*.set-cookie',
  'headers["set-cookie"]',
  '*.headers["set-cookie"]',
  'headers.set-cookie',
  '*.headers.set-cookie',
  'req.headers["set-cookie"]',
  '*.req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  '*.res.headers["set-cookie"]',

  // LINE Signatures & Tokens
  'x-line-signature',
  '*.x-line-signature',
  '*.*.x-line-signature',
  'headers["x-line-signature"]',
  '*.headers["x-line-signature"]',
  'headers.x-line-signature',
  '*.headers.x-line-signature',
  'req.headers["x-line-signature"]',
  '*.req.headers["x-line-signature"]',

  'replyToken',
  '*.replyToken',
  '*.*.replyToken',

  'idToken',
  '*.idToken',
  '*.*.idToken',

  'channelSecret',
  '*.channelSecret',
  '*.*.channelSecret',

  'LINE_CHANNEL_SECRET',
  '*.LINE_CHANNEL_SECRET',
  '*.*.LINE_CHANNEL_SECRET',

  'LINE_CHANNEL_ACCESS_TOKEN',
  '*.LINE_CHANNEL_ACCESS_TOKEN',
  '*.*.LINE_CHANNEL_ACCESS_TOKEN',

  'lineChannelSecret',
  '*.lineChannelSecret',
  '*.*.lineChannelSecret',

  'lineChannelAccessToken',
  '*.lineChannelAccessToken',
  '*.*.lineChannelAccessToken',

  // General Passwords, Keys, and Secrets
  'password',
  '*.password',
  '*.*.password',
  'secret',
  '*.secret',
  '*.*.secret',
  'token',
  '*.token',
  '*.*.token',
  'accessToken',
  '*.accessToken',
  '*.*.accessToken',
  'refreshToken',
  '*.refreshToken',
  '*.*.refreshToken',
  'apiKey',
  '*.apiKey',
  '*.*.apiKey',
  'api_key',
  '*.api_key',
  '*.*.api_key',

  // Database & Redis URLs / Credentials
  'DATABASE_URL',
  '*.DATABASE_URL',
  '*.*.DATABASE_URL',
  'REDIS_PASSWORD',
  '*.REDIS_PASSWORD',
  '*.*.REDIS_PASSWORD',
  'REDIS_URL',
  '*.REDIS_URL',
  '*.*.REDIS_URL',
  'POSTGRES_PASSWORD',
  '*.POSTGRES_PASSWORD',
  '*.*.POSTGRES_PASSWORD',
];

export const ALLOWED_LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type ValidLogLevel = (typeof ALLOWED_LOG_LEVELS)[number];

/**
 * Validates and resolves log level without importing env module (avoids circular dependency).
 */
export function resolveLogLevel(rawLevel?: string): ValidLogLevel {
  if (
    rawLevel &&
    (ALLOWED_LOG_LEVELS as readonly string[]).includes(rawLevel.toLowerCase())
  ) {
    return rawLevel.toLowerCase() as ValidLogLevel;
  }
  return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
}

const CONNECTION_STRING_PASSWORD_REGEX =
  /((?:postgres|postgresql|redis|rediss):\/\/[^@\s/]*:)([^@\s]+)(@)/gi;
const REDIS_AUTH_COMMAND_REGEX =
  /\b(AUTH\s+)(['"]?[^\s'"]+['"]?)/gi;

/**
 * Strips embedded passwords from connection string URLs and Redis AUTH commands in error messages.
 */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(CONNECTION_STRING_PASSWORD_REGEX, '$1***$3')
    .replace(REDIS_AUTH_COMMAND_REGEX, '$1***');
}

/**
 * Sanitizes an error object or string, removing sensitive connection credentials.
 */
export function sanitizeError(err: unknown): unknown {
  if (err instanceof Error) {
    const cleanMsg = sanitizeErrorMessage(err.message);
    const cleanStack = err.stack
      ? sanitizeErrorMessage(err.stack)
      : undefined;
    const sanitized = new Error(cleanMsg);
    sanitized.name = err.name;
    if (cleanStack) {
      sanitized.stack = cleanStack;
    }
    return sanitized;
  }
  if (typeof err === 'string') {
    return sanitizeErrorMessage(err);
  }
  return err;
}

/**
 * Safe metadata format for LINE webhook events (PDPA compliance).
 * Raw chat texts and raw webhook payloads must never be logged.
 */
export interface SafeWebhookEventLog {
  eventId?: string;
  eventType: string;
  messageType?: string;
  messageLength?: number;
  correlationId?: string;
  sourceType?: string;
}

export function sanitizeWebhookEventForLog(
  event: Record<string, any>
): SafeWebhookEventLog {
  if (!event || typeof event !== 'object') {
    return {
      eventType: 'unknown',
      correlationId: getCorrelationId(),
    };
  }

  return {
    eventId: event.webhookEventId ?? event.deliveryContext?.deliveryId,
    eventType: String(event.type ?? 'unknown'),
    messageType: event.message?.type,
    messageLength:
      typeof event.message?.text === 'string'
        ? event.message.text.length
        : undefined,
    correlationId: event.correlationId ?? getCorrelationId(),
    sourceType: event.source?.type,
  };
}

const serializeSanitizedError = (err: unknown) => {
  if (err instanceof Error) {
    const std = pino.stdSerializers.err(err);
    return {
      ...std,
      message: sanitizeErrorMessage(std.message),
      stack: std.stack ? sanitizeErrorMessage(std.stack) : undefined,
    };
  }
  return err;
};

export const defaultLoggerOptions: LoggerOptions = {
  level: resolveLogLevel(process.env.LOG_LEVEL),
  redact: {
    paths: defaultRedactPaths,
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: serializeSanitizedError,
    error: serializeSanitizedError,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
    log(object) {
      const store = logContextStorage.getStore();
      if (store) {
        // Enforce context precedence: context fields override caller-supplied object properties
        return { ...object, ...store };
      }
      return object;
    },
  },
};

export function createLogger(
  options?: LoggerOptions,
  destination?: pino.DestinationStream
): Logger {
  const mergedOptions: LoggerOptions = {
    ...defaultLoggerOptions,
    ...options,
    level: options?.level ?? defaultLoggerOptions.level,
    redact: options?.redact ?? defaultLoggerOptions.redact,
    serializers: {
      ...defaultLoggerOptions.serializers,
      ...options?.serializers,
    },
    formatters: {
      ...defaultLoggerOptions.formatters,
      ...options?.formatters,
    },
  };

  return destination ? pino(mergedOptions, destination) : pino(mergedOptions);
}

export const baseLogger: Logger = createLogger();

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return baseLogger.child(bindings);
}

export const logger = baseLogger;
