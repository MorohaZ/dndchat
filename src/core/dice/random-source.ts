import { randomInt } from 'node:crypto';

/**
 * Interface for generating random integers.
 */
export interface RandomSource {
  /**
   * Generates a random integer n such that min <= n <= max (inclusive).
   * @param min Minimum integer (inclusive)
   * @param max Maximum integer (inclusive)
   */
  randomInt(min: number, max: number): number;
}

/**
 * Cryptographically secure random integer source using Node.js crypto.randomInt.
 */
export class CryptoRandomSource implements RandomSource {
  randomInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new TypeError(`min and max must be integers, got min=${min}, max=${max}`);
    }
    if (min > max) {
      throw new RangeError(`min (${min}) cannot be greater than max (${max})`);
    }
    // Node.js crypto.randomInt requires min >= 0.
    // By offsetting with range = max - min + 1, we support negative bounds safely.
    const range = max - min + 1;
    return randomInt(0, range) + min;
  }
}

/**
 * Options for FakeRandomSource.
 */
export interface FakeRandomSourceOptions {
  /**
   * If true, cycles through the values indefinitely instead of throwing when exhausted.
   * Default: false.
   */
  loop?: boolean;
}

/**
 * Deterministic mock random source for unit testing.
 */
export class FakeRandomSource implements RandomSource {
  private values: number[];
  private index = 0;
  private readonly loop: boolean;

  constructor(values: number[] = [], options: FakeRandomSourceOptions = {}) {
    this.values = [...values];
    this.loop = options.loop ?? false;
  }

  randomInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new TypeError(`min and max must be integers, got min=${min}, max=${max}`);
    }
    if (min > max) {
      throw new RangeError(`min (${min}) cannot be greater than max (${max})`);
    }
    if (this.values.length === 0) {
      throw new Error('FakeRandomSource: No values available');
    }
    if (this.index >= this.values.length) {
      if (this.loop) {
        this.index = 0;
      } else {
        throw new Error(
          `FakeRandomSource: Exhausted all ${this.values.length} configured values`
        );
      }
    }

    const val = this.values[this.index++];
    if (val < min || val > max) {
      throw new RangeError(
        `FakeRandomSource: Configured value ${val} is out of requested bounds [${min}, ${max}]`
      );
    }
    return val;
  }

  /**
   * Enqueues additional values to the sequence.
   */
  enqueue(...values: number[]): void {
    this.values.push(...values);
  }

  /**
   * Resets the source with a new sequence of values.
   */
  setValues(values: number[]): void {
    this.values = [...values];
    this.index = 0;
  }

  /**
   * Number of remaining values before exhausting the sequence (when loop is false).
   */
  get remaining(): number {
    return Math.max(0, this.values.length - this.index);
  }
}
