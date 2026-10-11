/// <reference path="./benchmark/jstat.d.ts" />
import { jStat } from 'jstat';

/**
 * Calculates Chi-square critical values using jStat library.
 *
 * For Pearson's Goodness-of-Fit test on dice rolls:
 * - k = number of outcomes (e.g. d4 => 4, d6 => 6, d8 => 8, d10 => 10, d12 => 12, d20 => 20, d100 => 100)
 * - Degrees of freedom (df) = k - 1
 * - Significance level alpha (typically 0.05 or 0.01)
 * - Critical value = jStat.chisquare.inv(1 - alpha, df)
 */
export function calculateChiSquareCritical(df: number, alpha: number): number {
  return jStat.chisquare.inv(1 - alpha, df);
}

const diceTypes = [
  { name: 'd4', faces: 4, df: 3 },
  { name: 'd6', faces: 6, df: 5 },
  { name: 'd8', faces: 8, df: 7 },
  { name: 'd10', faces: 10, df: 9 },
  { name: 'd12', faces: 12, df: 11 },
  { name: 'd20', faces: 20, df: 19 },
  { name: 'd100', faces: 100, df: 99 },
];

const alphas = [0.05, 0.01, 0.001];

console.log('=== Chi-Square Critical Values Calculated with jStat library (v1.9.6) ===\n');
console.log('Formula: jStat.chisquare.inv(1 - alpha, df)\n');

const tableData: Record<string, any>[] = [];

for (const dice of diceTypes) {
  const row: Record<string, any> = {
    Die: dice.name,
    Faces: dice.faces,
    df: dice.df,
  };
  for (const alpha of alphas) {
    const crit = calculateChiSquareCritical(dice.df, alpha);
    row[`alpha_${alpha}`] = Number(crit.toFixed(4));
  }
  tableData.push(row);
}

console.table(tableData);

// Also verify d20 specifically
const d20_df = 19;
const d20_crit_05 = calculateChiSquareCritical(d20_df, 0.05);
const d20_crit_01 = calculateChiSquareCritical(d20_df, 0.01);
console.log(`\nDetailed verification for d20 (df = 19):`);
console.log(`- alpha = 0.05: critical value = ${d20_crit_05.toFixed(6)}`);
console.log(`- alpha = 0.01: critical value = ${d20_crit_01.toFixed(6)}`);
console.log(`- Verification: jStat.chisquare.cdf(${d20_crit_05.toFixed(6)}, 19) = ${jStat.chisquare.cdf(d20_crit_05, 19).toFixed(6)} (Expected: 0.950000)`);
console.log(`- Verification: jStat.chisquare.cdf(${d20_crit_01.toFixed(6)}, 19) = ${jStat.chisquare.cdf(d20_crit_01, 19).toFixed(6)} (Expected: 0.990000)`);
