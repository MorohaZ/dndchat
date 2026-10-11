import { describe, it, expect } from 'vitest';
import {
  CryptoRandomSource,
  FakeRandomSource,
} from './random-source';

describe('CryptoRandomSource', () => {
  const source = new CryptoRandomSource();

  it('should generate numbers strictly within [min, max] range inclusive', () => {
    for (let i = 0; i < 100; i++) {
      const val = source.randomInt(1, 6);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('should return the single value when min equals max', () => {
    expect(source.randomInt(20, 20)).toBe(20);
    expect(source.randomInt(1, 1)).toBe(1);
    expect(source.randomInt(-5, -5)).toBe(-5);
  });

  it('should correctly support negative bounds without throwing', () => {
    for (let i = 0; i < 50; i++) {
      const val = source.randomInt(-5, 5);
      expect(val).toBeGreaterThanOrEqual(-5);
      expect(val).toBeLessThanOrEqual(5);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('should throw RangeError when min > max', () => {
    expect(() => source.randomInt(10, 5)).toThrowError(RangeError);
  });

  it('should throw TypeError when arguments are not integers', () => {
    expect(() => source.randomInt(1.5, 6)).toThrowError(TypeError);
    expect(() => source.randomInt(1, 6.2)).toThrowError(TypeError);
    expect(() => source.randomInt(NaN, 6)).toThrowError(TypeError);
  });

  it('should roll d4 and d20 thousands of times with CryptoRandomSource verifying min/max extremes and bounds', () => {
    const TRIALS = 5000;

    // Test d4 (min 1, max 4)
    let d4Min = Infinity;
    let d4Max = -Infinity;
    for (let i = 0; i < TRIALS; i++) {
      const val = source.randomInt(1, 4);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(4);
      if (val < d4Min) d4Min = val;
      if (val > d4Max) d4Max = val;
    }
    expect(d4Min).toBe(1);
    expect(d4Max).toBe(4);

    // Test d20 (min 1, max 20)
    let d20Min = Infinity;
    let d20Max = -Infinity;
    for (let i = 0; i < TRIALS; i++) {
      const val = source.randomInt(1, 20);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(20);
      if (val < d20Min) d20Min = val;
      if (val > d20Max) d20Max = val;
    }
    expect(d20Min).toBe(1);
    expect(d20Max).toBe(20);
  });
});

describe('FakeRandomSource', () => {
  it('should return predefined values in FIFO order', () => {
    const fake = new FakeRandomSource([10, 20, 5]);
    expect(fake.remaining).toBe(3);
    expect(fake.randomInt(1, 20)).toBe(10);
    expect(fake.remaining).toBe(2);
    expect(fake.randomInt(1, 20)).toBe(20);
    expect(fake.remaining).toBe(1);
    expect(fake.randomInt(1, 20)).toBe(5);
    expect(fake.remaining).toBe(0);
  });

  it('should throw Error when exhausted if loop=false', () => {
    const fake = new FakeRandomSource([1]);
    expect(fake.randomInt(1, 20)).toBe(1);
    expect(() => fake.randomInt(1, 20)).toThrowError(
      /FakeRandomSource: Exhausted all 1 configured values/
    );
  });

  it('should throw Error if initialized empty', () => {
    const fake = new FakeRandomSource([]);
    expect(() => fake.randomInt(1, 20)).toThrowError(
      /FakeRandomSource: No values available/
    );
  });

  it('should cycle indefinitely when loop=true', () => {
    const fake = new FakeRandomSource([4, 6], { loop: true });
    expect(fake.randomInt(1, 6)).toBe(4);
    expect(fake.randomInt(1, 6)).toBe(6);
    expect(fake.randomInt(1, 6)).toBe(4);
    expect(fake.randomInt(1, 6)).toBe(6);
  });

  it('should allow enqueuing and resetting values', () => {
    const fake = new FakeRandomSource([1]);
    fake.enqueue(2, 3);
    expect(fake.remaining).toBe(3);
    expect(fake.randomInt(1, 6)).toBe(1);
    expect(fake.randomInt(1, 6)).toBe(2);

    fake.setValues([99]);
    expect(fake.remaining).toBe(1);
    expect(fake.randomInt(1, 100)).toBe(99);
  });

  it('should validate min and max boundaries', () => {
    const fake = new FakeRandomSource([5]);
    expect(() => fake.randomInt(10, 2)).toThrowError(RangeError);
    expect(() => fake.randomInt(1.2, 5)).toThrowError(TypeError);
  });

  it('should throw RangeError when configured value is outside requested [min, max] bounds', () => {
    const fakeLow = new FakeRandomSource([0]);
    expect(() => fakeLow.randomInt(1, 20)).toThrowError(
      /FakeRandomSource: Configured value 0 is out of requested bounds \[1, 20\]/
    );

    const fakeHigh = new FakeRandomSource([21]);
    expect(() => fakeHigh.randomInt(1, 20)).toThrowError(
      /FakeRandomSource: Configured value 21 is out of requested bounds \[1, 20\]/
    );

    const fakeD6 = new FakeRandomSource([7]);
    expect(() => fakeD6.randomInt(1, 6)).toThrowError(
      /FakeRandomSource: Configured value 7 is out of requested bounds \[1, 6\]/
    );
  });
});
