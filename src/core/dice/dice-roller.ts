import { RandomSource, CryptoRandomSource } from './random-source';
import {
  ParsedDiceExpression,
  parseDiceExpression,
  DiceParseError,
  VALID_FACES,
  MIN_DICE_COUNT,
  MAX_DICE_COUNT,
  MIN_MODIFIER,
  MAX_MODIFIER,
} from './dice-parser';

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
 * Validates expression bounds independently (defense in depth).
 */
export function evaluateRoll(
  expression: ParsedDiceExpression,
  randomSource: RandomSource = new CryptoRandomSource()
): RollResult {
  if (!expression || typeof expression !== 'object') {
    throw new DiceParseError('Expression must be a valid ParsedDiceExpression object');
  }

  const { count, faces, modifier, advantageMode, keepHighest } = expression;

  // Defense-in-depth bounds validation
  if (!Number.isInteger(count) || count < MIN_DICE_COUNT || count > MAX_DICE_COUNT) {
    throw new DiceParseError(
      `Dice count must be an integer between ${MIN_DICE_COUNT} and ${MAX_DICE_COUNT} (got ${count})`
    );
  }

  if (!Number.isInteger(faces) || !VALID_FACES.has(faces)) {
    throw new DiceParseError(
      `Invalid die face d${faces}. Valid dice are d4, d6, d8, d10, d12, d20, d100`
    );
  }

  if (!Number.isInteger(modifier) || modifier < MIN_MODIFIER || modifier > MAX_MODIFIER) {
    throw new DiceParseError(
      `Modifier must be an integer between ${MIN_MODIFIER} and +${MAX_MODIFIER} (got ${modifier})`
    );
  }

  if (advantageMode !== 'normal') {
    if (advantageMode !== 'advantage' && advantageMode !== 'disadvantage') {
      throw new DiceParseError(`Invalid advantage mode: ${advantageMode}`);
    }
    if (keepHighest !== undefined) {
      throw new DiceParseError(
        'Cannot combine keep-highest (kh) with advantage or disadvantage'
      );
    }
    if (count !== 1) {
      throw new DiceParseError(
        'Advantage and disadvantage can only be applied to a single die roll'
      );
    }
  }

  if (keepHighest !== undefined) {
    if (!Number.isInteger(keepHighest) || keepHighest < 1) {
      throw new DiceParseError(
        `Keep-highest count must be at least 1 (got ${keepHighest})`
      );
    }
    if (keepHighest > count) {
      throw new DiceParseError(
        `Cannot keep ${keepHighest} dice when only rolling ${count} dice`
      );
    }
  }

  let rolls: number[] = [];
  let keptRolls: number[] = [];
  let droppedRolls: number[] = [];

  if (advantageMode === 'advantage') {
    // Advantage: roll 2 dice with specified faces, keep the higher roll
    const r1 = randomSource.randomInt(1, faces);
    const r2 = randomSource.randomInt(1, faces);
    rolls = [r1, r2];
    const kept = Math.max(r1, r2);
    const dropped = Math.min(r1, r2);
    keptRolls = [kept];
    droppedRolls = [dropped];
  } else if (advantageMode === 'disadvantage') {
    // Disadvantage: roll 2 dice with specified faces, keep the lower roll
    const r1 = randomSource.randomInt(1, faces);
    const r2 = randomSource.randomInt(1, faces);
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

  // Crit and Fumble checks: only on a single d20 roll (count === 1 and faces === 20, including adv/dis where exactly 1 kept roll).
  // Excludes multi-dice rolls (e.g. 2d20, 4d20, 3d20kh2).
  let isCrit = false;
  let isFumble = false;

  const isSingleD20 =
    faces === 20 &&
    count === 1 &&
    keepHighest === undefined &&
    keptRolls.length === 1;

  if (isSingleD20) {
    isCrit = keptRolls[0] === 20;
    isFumble = keptRolls[0] === 1;
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
