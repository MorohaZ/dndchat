import { RandomSource, CryptoRandomSource } from './random-source';
import { ParsedDiceExpression, parseDiceExpression } from './dice-parser';

export interface RollResult {
  readonly expression: ParsedDiceExpression;
  readonly rolls: readonly number[];
  readonly keptRolls: readonly number[];
  readonly droppedRolls: readonly number[];
  readonly subtotal: number;
  readonly modifier: number;
  readonly total: number;
  readonly isCrit: boolean;
  readonly isFumble: boolean;
}

/**
 * Evaluates a parsed dice expression using the provided RandomSource.
 */
export function evaluateRoll(
  expression: ParsedDiceExpression,
  randomSource: RandomSource = new CryptoRandomSource()
): RollResult {
  const { count, faces, modifier, advantageMode, keepHighest } = expression;

  let rolls: number[] = [];
  let keptRolls: number[] = [];
  let droppedRolls: number[] = [];

  if (advantageMode === 'advantage') {
    // Advantage: roll 2d20, keep the higher roll
    const r1 = randomSource.randomInt(1, 20);
    const r2 = randomSource.randomInt(1, 20);
    rolls = [r1, r2];
    const kept = Math.max(r1, r2);
    const dropped = Math.min(r1, r2);
    keptRolls = [kept];
    droppedRolls = [dropped];
  } else if (advantageMode === 'disadvantage') {
    // Disadvantage: roll 2d20, keep the lower roll
    const r1 = randomSource.randomInt(1, 20);
    const r2 = randomSource.randomInt(1, 20);
    rolls = [r1, r2];
    const kept = Math.min(r1, r2);
    const dropped = Math.max(r1, r2);
    keptRolls = [kept];
    droppedRolls = [dropped];
  } else if (keepHighest !== undefined) {
    // Keep highest: roll count dice, keep top K, drop the rest
    for (let i = 0; i < count; i++) {
      rolls.push(randomSource.randomInt(1, faces));
    }
    const sorted = [...rolls].sort((a, b) => b - a);
    keptRolls = sorted.slice(0, keepHighest);
    droppedRolls = sorted.slice(keepHighest);
  } else {
    // Normal roll
    for (let i = 0; i < count; i++) {
      rolls.push(randomSource.randomInt(1, faces));
    }
    keptRolls = [...rolls];
    droppedRolls = [];
  }

  const subtotal = keptRolls.reduce((sum, n) => sum + n, 0);
  const total = subtotal + modifier;

  // Crit and Fumble checks on d20
  let isCrit = false;
  let isFumble = false;

  if (faces === 20) {
    if (advantageMode !== 'normal' || count === 1) {
      // Single check or adv/dis: check the kept d20 roll
      isCrit = keptRolls[0] === 20;
      isFumble = keptRolls[0] === 1;
    } else {
      // Multiple d20 normal roll
      isCrit = keptRolls.includes(20);
      isFumble = !isCrit && keptRolls.includes(1);
    }
  }

  return {
    expression,
    rolls: Object.freeze([...rolls]),
    keptRolls: Object.freeze([...keptRolls]),
    droppedRolls: Object.freeze([...droppedRolls]),
    subtotal,
    modifier,
    total,
    isCrit,
    isFumble,
  };
}

/**
 * Convenient helper to parse and roll dice in a single call.
 */
export function rollDice(
  input: string | ParsedDiceExpression,
  randomSource: RandomSource = new CryptoRandomSource()
): RollResult {
  const expr = typeof input === 'string' ? parseDiceExpression(input) : input;
  return evaluateRoll(expr, randomSource);
}

/**
 * DiceRoller engine with injectable RandomSource.
 */
export class DiceRoller {
  constructor(
    private readonly randomSource: RandomSource = new CryptoRandomSource()
  ) {}

  roll(input: string | ParsedDiceExpression): RollResult {
    return rollDice(input, this.randomSource);
  }
}
