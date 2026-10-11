import { jStat } from 'jstat';

/**
 * Calculates Chi-square critical value for hypothesis testing.
 * @param df Degrees of freedom (k - 1)
 * @param alpha Significance level (e.g. 0.05, 0.01)
 * @returns Critical value
 */
export function getChiSquareCriticalValue(df: number, alpha: number = 0.05): number {
  if (df <= 0) {
    throw new Error('Degrees of freedom must be greater than 0');
  }
  if (alpha <= 0 || alpha >= 1) {
    throw new Error('Significance level alpha must be between 0 and 1');
  }
  return jStat.chisquare.inv(1 - alpha, df);
}

/**
 * Evaluates Pearson's Chi-squared Goodness-of-Fit test for dice fairness.
 *
 * H0: The die is fair (all outcomes equally probable with probability 1/k).
 * Ha: The die is biased.
 *
 * @param observed Array of observed frequencies for each face
 * @param alpha Significance level (default 0.05)
 * @returns Test result including chi2 statistic, critical value, p-value, and whether H0 is rejected.
 */
export function testDiceFairness(observed: number[], alpha: number = 0.05) {
  const k = observed.length;
  if (k < 2) {
    throw new Error('Dice must have at least 2 faces');
  }

  const totalRolls = observed.reduce((sum, count) => sum + count, 0);
  if (totalRolls === 0) {
    throw new Error('Total rolls must be greater than 0');
  }

  const expected = totalRolls / k;
  const df = k - 1;

  // Pearson's chi-square test statistic: sum((O - E)^2 / E)
  const chiSquareStatistic = observed.reduce((sum, o) => {
    const diff = o - expected;
    return sum + (diff * diff) / expected;
  }, 0);

  const criticalValue = getChiSquareCriticalValue(df, alpha);
  // p-value is P(X >= chiSquareStatistic) = 1 - CDF(chiSquareStatistic)
  const pValue = 1 - jStat.chisquare.cdf(chiSquareStatistic, df);

  const isBiased = chiSquareStatistic > criticalValue;

  return {
    k,
    df,
    totalRolls,
    expectedPerFace: expected,
    chiSquareStatistic,
    criticalValue,
    pValue,
    alpha,
    isBiased,
  };
}
