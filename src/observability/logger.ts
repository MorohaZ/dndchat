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

const defaultOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'password',
      'token',
      'secret',
      'LINE_CHANNEL_SECRET',
      'LINE_CHANNEL_ACCESS_TOKEN',
      '*.password',
      '*.secret',
      '*.token',
    ],
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

// Base Pino logger instance
export const baseLogger: Logger = pino(defaultOptions);

/**
 * Returns a child logger with specified bindings, inheriting or overriding correlationId.
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return baseLogger.child(bindings);
}

// Default exported logger
export const logger = baseLogger;
