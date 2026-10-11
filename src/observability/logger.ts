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

/**
 * Gets the current log context from AsyncLocalStorage.
 */
export function getLogContext(): LogContext | undefined {
  return logContextStorage.getStore();
}

/**
 * Gets current correlation ID if set.
 */
export function getCorrelationId(): string | undefined {
  return logContextStorage.getStore()?.correlationId;
}

/**
 * Runs an asynchronous callback with the given correlation context.
 */
export function runWithCorrelationContext<T>(
  context: LogContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return logContextStorage.run(context, fn);
}

export const defaultRedactPaths = [
  'authorization',
  '*.authorization',
  '*.*.authorization',
  'headers.authorization',
  '*.headers.authorization',
  'req.headers.authorization',
  '*.req.headers.authorization',
  'password',
  '*.password',
  '*.*.password',
  'secret',
  '*.secret',
  '*.*.secret',
  'token',
  '*.token',
  '*.*.token',
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
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
  'DATABASE_URL',
  '*.DATABASE_URL',
  'REDIS_PASSWORD',
  '*.REDIS_PASSWORD',
  'POSTGRES_PASSWORD',
  '*.POSTGRES_PASSWORD',
];

export const defaultLoggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: defaultRedactPaths,
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
    log(object) {
      const store = logContextStorage.getStore();
      if (store) {
        return { ...store, ...object };
      }
      return object;
    },
  },
};

/**
 * Creates a Pino logger instance with correlation ID support and sensitive data redaction.
 */
export function createLogger(
  options?: LoggerOptions,
  destination?: pino.DestinationStream
): Logger {
  const mergedOptions: LoggerOptions = {
    ...defaultLoggerOptions,
    ...options,
    redact: options?.redact ?? defaultLoggerOptions.redact,
    formatters: {
      ...defaultLoggerOptions.formatters,
      ...options?.formatters,
    },
  };

  return destination ? pino(mergedOptions, destination) : pino(mergedOptions);
}

// Base Pino logger instance
export const baseLogger: Logger = createLogger();

/**
 * Returns a child logger with specified bindings, inheriting or overriding correlationId.
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return baseLogger.child(bindings);
}

// Default exported logger
export const logger = baseLogger;

