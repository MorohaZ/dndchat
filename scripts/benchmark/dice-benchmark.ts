import { CryptoRandomSource } from '../../src/core/dice/random-source';
import { testDiceFairness } from './dice-stats';

/**
 * Benchmark runner testing real Node.js crypto.randomInt via CryptoRandomSource.
 * Performs Pearson's Chi-squared Goodness-of-Fit test across all faces.
 *
 * @param faces Number of die faces (default 20 for d20)
 * @param totalRolls Number of simulated rolls (default 100,000)
 * @param alpha Significance level (default 0.05)
 */
export function runCryptoDiceBenchmark(
  faces: number = 20,
  totalRolls: number = 100_000,
  alpha: number = 0.05
) {
  const source = new CryptoRandomSource();
  const counts = new Array<number>(faces).fill(0);

  const startTime = Date.now();
  for (let i = 0; i < totalRolls; i++) {
    const roll = source.randomInt(1, faces);
    counts[roll - 1]++;
  }
  const durationMs = Math.max(Date.now() - startTime, 1);
  const rollsPerSec = Math.round((totalRolls / durationMs) * 1000);

  const fairness = testDiceFairness(counts, alpha);

  return {
    faces,
    totalRolls,
    durationMs,
    rollsPerSec,
    counts,
    ...fairness,
  };
}

if (process.argv[1] && process.argv[1].includes('dice-benchmark')) {
  console.log('=== CryptoRandomSource (crypto.randomInt) Benchmark ===\n');
  const d20Bench = runCryptoDiceBenchmark(20, 100_000, 0.05);

  console.log(`Simulated ${d20Bench.totalRolls.toLocaleString()} d20 rolls in ${d20Bench.durationMs}ms`);
  console.log(`Throughput: ${d20Bench.rollsPerSec.toLocaleString()} rolls/sec`);
  console.log(`Chi-Square Statistic: ${d20Bench.chiSquareStatistic.toFixed(4)}`);
  console.log(`Critical Value (alpha=0.05, df=19): ${d20Bench.criticalValue.toFixed(4)}`);
  console.log(`p-value: ${d20Bench.pValue.toFixed(4)}`);
  console.log(`Result: ${d20Bench.isBiased ? 'REJECT H0 (Biased)' : 'ACCEPT H0 (Fair Uniform Distribution)'}`);
}
