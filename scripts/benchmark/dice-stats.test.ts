import { describe, it, expect } from 'vitest';
import { getChiSquareCriticalValue, testDiceFairness } from './dice-stats';

describe('Chi-Square Critical Value & Fairness Testing (dice-stats.ts)', () => {
  it('should calculate verified critical values for d20 (df=19)', () => {
    // df = 19, alpha = 0.05
    const crit05 = getChiSquareCriticalValue(19, 0.05);
    expect(crit05).toBeCloseTo(30.1435, 4);

    // df = 19, alpha = 0.01
    const crit01 = getChiSquareCriticalValue(19, 0.01);
    expect(crit01).toBeCloseTo(36.1909, 4);
  });

  it('should calculate verified critical values for d6 (df=5)', () => {
    // df = 5, alpha = 0.05
    const crit05 = getChiSquareCriticalValue(5, 0.05);
    expect(crit05).toBeCloseTo(11.0705, 4);

    // df = 5, alpha = 0.01
    const crit01 = getChiSquareCriticalValue(5, 0.01);
    expect(crit01).toBeCloseTo(15.0863, 4);
  });

  it('should validate boundary conditions and throw on invalid arguments', () => {
    expect(() => getChiSquareCriticalValue(0, 0.05)).toThrowError(
      /Degrees of freedom must be greater than 0/
    );
    expect(() => getChiSquareCriticalValue(10, -0.1)).toThrowError(
      /Significance level alpha must be between 0 and 1/
    );
    expect(() => getChiSquareCriticalValue(10, 1)).toThrowError(
      /Significance level alpha must be between 0 and 1/
    );
  });

  it('should evaluate uniform fair dice rolls without rejecting H0', () => {
    // 600 rolls of fair d6 (100 rolls each face)
    const fairD6Rolls = [100, 100, 100, 100, 100, 100];
    const result = testDiceFairness(fairD6Rolls, 0.05);

    expect(result.k).toBe(6);
    expect(result.df).toBe(5);
    expect(result.chiSquareStatistic).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.isBiased).toBe(false);
  });

  it('should detect biased dice rolls and reject H0', () => {
    // heavily biased d6 (e.g. face 6 rolled 300 times out of 600)
    const biasedD6Rolls = [60, 60, 60, 60, 60, 300];
    const result = testDiceFairness(biasedD6Rolls, 0.05);

    expect(result.chiSquareStatistic).toBeGreaterThan(result.criticalValue);
    expect(result.pValue).toBeLessThan(0.0001);
    expect(result.isBiased).toBe(true);
  });
});
