import { describe, it, expect } from 'vitest';
import {
  logger,
  baseLogger,
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
});
