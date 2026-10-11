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
});
