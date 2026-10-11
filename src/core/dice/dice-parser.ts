/**
 * Custom error class for dice notation parsing failures.
 */
export class DiceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiceParseError';
  }
}

export type AdvantageMode = 'normal' | 'advantage' | 'disadvantage';

export interface ParsedDiceExpression {
  readonly raw: string;
  readonly count: number;
  readonly faces: number;
  readonly modifier: number;
  readonly advantageMode: AdvantageMode;
  readonly keepHighest?: number;
}

export type TokenType =
  | 'NUMBER'
  | 'D'
  | 'ADV'
  | 'DIS'
  | 'KH'
  | 'PLUS'
  | 'MINUS'
  | 'EOF';

export interface Token {
  readonly type: TokenType;
  readonly value?: number;
  readonly pos: number;
}

const VALID_FACES = new Set([4, 6, 8, 10, 12, 20, 100]);
const MAX_EXPRESSION_LENGTH = 60;
const MIN_DICE_COUNT = 1;
const MAX_DICE_COUNT = 20;
const MIN_MODIFIER = -30;
const MAX_MODIFIER = 30;

/**
 * Tokenizes the input string using a linear scanner.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    if (ch === '+') {
      tokens.push({ type: 'PLUS', pos: i });
      i++;
      continue;
    }

    if (ch === '-') {
      tokens.push({ type: 'MINUS', pos: i });
      i++;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      const start = i;
      while (i < len && input[i] >= '0' && input[i] <= '9') {
        i++;
      }
      const numStr = input.slice(start, i);
      const val = parseInt(numStr, 10);
      tokens.push({ type: 'NUMBER', value: val, pos: start });
      continue;
    }

    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      const start = i;
      while (
        i < len &&
        ((input[i] >= 'a' && input[i] <= 'z') ||
          (input[i] >= 'A' && input[i] <= 'Z'))
      ) {
        i++;
      }
      const word = input.slice(start, i).toLowerCase();
      if (word === 'd') {
        tokens.push({ type: 'D', pos: start });
      } else if (word === 'adv') {
        tokens.push({ type: 'ADV', pos: start });
      } else if (word === 'dis') {
        tokens.push({ type: 'DIS', pos: start });
      } else if (word === 'kh') {
        tokens.push({ type: 'KH', pos: start });
      } else {
        throw new DiceParseError(
          `Unrecognized token "${input.slice(start, i)}" at position ${start}`
        );
      }
      continue;
    }

    throw new DiceParseError(`Unexpected character "${ch}" at position ${i}`);
  }

  tokens.push({ type: 'EOF', pos: len });
  return tokens;
}

/**
 * Parses a dice notation expression string into a structured ParsedDiceExpression.
 *
 * Supported notations:
 * - XdY (e.g. 1d20, 2d6, d20)
 * - XdY+Z, XdY-Z (e.g. 1d20+5, 1d20 - 5)
 * - 1d20 adv +Z, adv 1d20+Z (with or without modifier)
 * - 1d20 dis -Z, dis 1d20-Z (with or without modifier)
 * - 4d6kh3 (drop lowest dice, keep highest 3)
 *
 * Security and semantic bounds:
 * - Length <= 60 characters
 * - Dice count 1 <= N <= 20
 * - Valid dice faces: d4, d6, d8, d10, d12, d20, d100
 * - Modifier range: -30 to +30
 * - Advantage/Disadvantage only on single d20
 */
export function parseDiceExpression(raw: string): ParsedDiceExpression {
  if (typeof raw !== 'string') {
    throw new DiceParseError('Input expression must be a string');
  }

  if (raw.length > MAX_EXPRESSION_LENGTH) {
    throw new DiceParseError(
      `Dice expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters (length: ${raw.length})`
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new DiceParseError('Dice expression cannot be empty');
  }

  const tokens = tokenize(raw);
  let idx = 0;

  function peek(): Token {
    return tokens[idx];
  }

  function consume(): Token {
    return tokens[idx++];
  }

  let advantageMode: AdvantageMode = 'normal';
  let count: number;
  let faces: number;
  let keepHighest: number | undefined;
  let modifier = 0;

  // 1. Check leading advantage/disadvantage (e.g., "adv 1d20+5")
  if (peek().type === 'ADV') {
    consume();
    advantageMode = 'advantage';
  } else if (peek().type === 'DIS') {
    consume();
    advantageMode = 'disadvantage';
  }

  // 2. Dice count or 'd' (e.g., "1d20" or "d20")
  if (peek().type === 'NUMBER') {
    count = consume().value!;
    if (peek().type !== 'D') {
      throw new DiceParseError(
        `Expected "d" after dice count at position ${peek().pos}`
      );
    }
    consume(); // consume 'D'
  } else if (peek().type === 'D') {
    consume(); // default count = 1
    count = 1;
  } else {
    throw new DiceParseError(
      `Expected dice notation (e.g., 1d20) at position ${peek().pos}`
    );
  }

  // 3. Faces
  if (peek().type !== 'NUMBER') {
    throw new DiceParseError(
      `Expected number of faces after "d" at position ${peek().pos}`
    );
  }
  faces = consume().value!;

  // 4. Infix modifiers: inline adv/dis OR keep-highest (kh)
  if (peek().type === 'ADV') {
    if (advantageMode !== 'normal') {
      throw new DiceParseError('Cannot specify advantage/disadvantage multiple times');
    }
    consume();
    advantageMode = 'advantage';
  } else if (peek().type === 'DIS') {
    if (advantageMode !== 'normal') {
      throw new DiceParseError('Cannot specify advantage/disadvantage multiple times');
    }
    consume();
    advantageMode = 'disadvantage';
  } else if (peek().type === 'KH') {
    if (advantageMode !== 'normal') {
      throw new DiceParseError(
        'Cannot combine keep-highest (kh) with advantage or disadvantage'
      );
    }
    consume();
    if (peek().type !== 'NUMBER') {
      throw new DiceParseError(
        `Expected number after "kh" at position ${peek().pos}`
      );
    }
    keepHighest = consume().value!;
  }

  // 5. Modifier: +Z or -Z
  if (peek().type === 'PLUS' || peek().type === 'MINUS') {
    const isPlus = peek().type === 'PLUS';
    const signPos = peek().pos;
    consume();
    if (peek().type !== 'NUMBER') {
      throw new DiceParseError(
        `Expected modifier number after "${isPlus ? '+' : '-'}" at position ${signPos}`
      );
    }
    const modVal = consume().value!;
    modifier = isPlus ? modVal : -modVal;
  }

  // 6. Trailing advantage/disadvantage (e.g., "1d20 + 5 adv")
  if (peek().type === 'ADV') {
    if (advantageMode !== 'normal') {
      throw new DiceParseError('Cannot specify advantage/disadvantage multiple times');
    }
    consume();
    advantageMode = 'advantage';
  } else if (peek().type === 'DIS') {
    if (advantageMode !== 'normal') {
      throw new DiceParseError('Cannot specify advantage/disadvantage multiple times');
    }
    consume();
    advantageMode = 'disadvantage';
  }

  // 7. Verify no trailing unexpected tokens
  if (peek().type !== 'EOF') {
    throw new DiceParseError(
      `Unexpected token "${peek().type}" at position ${peek().pos}`
    );
  }

  // 8. Semantic bounds validation
  if (count < MIN_DICE_COUNT || count > MAX_DICE_COUNT) {
    throw new DiceParseError(
      `Dice count must be between ${MIN_DICE_COUNT} and ${MAX_DICE_COUNT} (got ${count})`
    );
  }

  if (!VALID_FACES.has(faces)) {
    throw new DiceParseError(
      `Invalid die face d${faces}. Valid dice are d4, d6, d8, d10, d12, d20, d100`
    );
  }

  if (modifier < MIN_MODIFIER || modifier > MAX_MODIFIER) {
    throw new DiceParseError(
      `Modifier must be between ${MIN_MODIFIER} and +${MAX_MODIFIER} (got ${modifier})`
    );
  }

  if (advantageMode !== 'normal') {
    if (keepHighest !== undefined) {
      throw new DiceParseError(
        'Cannot combine keep-highest (kh) with advantage or disadvantage'
      );
    }
    if (count !== 1 || faces !== 20) {
      throw new DiceParseError(
        'Advantage and disadvantage can only be applied to a single d20 roll (e.g., 1d20 adv or adv 1d20)'
      );
    }
  }

  if (keepHighest !== undefined) {
    if (keepHighest < 1) {
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

  return {
    raw,
    count,
    faces,
    modifier,
    advantageMode,
    ...(keepHighest !== undefined ? { keepHighest } : {}),
  };
}
