import { describe, it, expect } from 'vitest';
import { parseDiceExpression, DiceParseError } from './dice-parser';

describe('DiceParser', () => {
  describe('Standard XdY Notations', () => {
    it('should parse simple "1d20"', () => {
      const res = parseDiceExpression('1d20');
      expect(res.count).toBe(1);
      expect(res.faces).toBe(20);
      expect(res.modifier).toBe(0);
      expect(res.advantageMode).toBe('normal');
      expect(res.keepHighest).toBeUndefined();
    });

    it('should default dice count to 1 when omitted (e.g. "d20")', () => {
      const res = parseDiceExpression('d20');
      expect(res.count).toBe(1);
      expect(res.faces).toBe(20);
      expect(res.modifier).toBe(0);
    });

    it('should parse multi-dice expressions (e.g. "2d6", "8d8", "20d4")', () => {
      const res2d6 = parseDiceExpression('2d6');
      expect(res2d6.count).toBe(2);
      expect(res2d6.faces).toBe(6);

      const res20d4 = parseDiceExpression('20d4');
      expect(res20d4.count).toBe(20);
      expect(res20d4.faces).toBe(4);
    });

    it('should parse percentile dice "1d100"', () => {
      const res = parseDiceExpression('1d100');
      expect(res.count).toBe(1);
      expect(res.faces).toBe(100);
    });
  });

  describe('Modifiers (+Z, -Z)', () => {
    it('should parse positive modifier with and without spaces', () => {
      const res1 = parseDiceExpression('1d20+5');
      expect(res1.modifier).toBe(5);

      const res2 = parseDiceExpression('1d20 + 5');
      expect(res2.modifier).toBe(5);

      const res3 = parseDiceExpression('  2d6   +   3  ');
      expect(res3.modifier).toBe(3);
    });

    it('should parse negative modifier with and without spaces', () => {
      const res1 = parseDiceExpression('1d20-2');
      expect(res1.modifier).toBe(-2);

      const res2 = parseDiceExpression('1d20 - 2');
      expect(res2.modifier).toBe(-2);
    });

    it('should parse zero modifier "+0" and "-0" as positive 0', () => {
      const resPlus = parseDiceExpression('1d20+0');
      expect(resPlus.modifier).toBe(0);
      expect(Object.is(resPlus.modifier, 0)).toBe(true);

      const resMinus = parseDiceExpression('1d20-0');
      expect(resMinus.modifier).toBe(0);
      expect(Object.is(resMinus.modifier, 0)).toBe(true);
    });
  });

  describe('Advantage and Disadvantage Notations', () => {
    it('should parse "1d20 adv +Z" and "adv 1d20+Z"', () => {
      const res1 = parseDiceExpression('1d20 adv + 5');
      expect(res1.advantageMode).toBe('advantage');
      expect(res1.faces).toBe(20);
      expect(res1.count).toBe(1);
      expect(res1.modifier).toBe(5);

      const res2 = parseDiceExpression('adv 1d20+5');
      expect(res2.advantageMode).toBe('advantage');
      expect(res2.modifier).toBe(5);

      const res3 = parseDiceExpression('adv 1d20');
      expect(res3.advantageMode).toBe('advantage');
      expect(res3.modifier).toBe(0);

      const res4 = parseDiceExpression('1d20 adv');
      expect(res4.advantageMode).toBe('advantage');
      expect(res4.modifier).toBe(0);
    });

    it('should parse "1d20 dis -Z" and "dis 1d20-Z"', () => {
      const res1 = parseDiceExpression('1d20 dis - 3');
      expect(res1.advantageMode).toBe('disadvantage');
      expect(res1.faces).toBe(20);
      expect(res1.count).toBe(1);
      expect(res1.modifier).toBe(-3);

      const res2 = parseDiceExpression('dis 1d20-3');
      expect(res2.advantageMode).toBe('disadvantage');
      expect(res2.modifier).toBe(-3);

      const res3 = parseDiceExpression('dis 1d20');
      expect(res3.advantageMode).toBe('disadvantage');
      expect(res3.modifier).toBe(0);
    });

    it('should parse trailing adv/dis (e.g. "1d20 + 5 adv")', () => {
      const res = parseDiceExpression('1d20 + 5 adv');
      expect(res.advantageMode).toBe('advantage');
      expect(res.modifier).toBe(5);
    });
  });

  describe('Keep Highest (kh) Notations', () => {
    it('should parse "4d6kh3" (keep highest 3)', () => {
      const res = parseDiceExpression('4d6kh3');
      expect(res.count).toBe(4);
      expect(res.faces).toBe(6);
      expect(res.keepHighest).toBe(3);
      expect(res.modifier).toBe(0);
    });

    it('should parse "4d6kh3 + 2" with modifier and spaces', () => {
      const res = parseDiceExpression('4d6 kh 3 + 2');
      expect(res.count).toBe(4);
      expect(res.faces).toBe(6);
      expect(res.keepHighest).toBe(3);
      expect(res.modifier).toBe(2);
    });
  });

  describe('Input Normalization', () => {
    it('should be case-insensitive for dice "1D20", "ADV", "DIS", "KH3"', () => {
      const res1 = parseDiceExpression('1D20');
      expect(res1.faces).toBe(20);

      const res2 = parseDiceExpression('ADV 1D20 + 5');
      expect(res2.advantageMode).toBe('advantage');

      const res3 = parseDiceExpression('1D20 DIS - 2');
      expect(res3.advantageMode).toBe('disadvantage');

      const res4 = parseDiceExpression('4D6KH3');
      expect(res4.keepHighest).toBe(3);
    });

    it('should handle excessive whitespace gracefully', () => {
      const res = parseDiceExpression('   1d20   +   5   ');
      expect(res.count).toBe(1);
      expect(res.faces).toBe(20);
      expect(res.modifier).toBe(5);
    });

    it('should support Unicode whitespace such as non-breaking space and full-width ideographic space', () => {
      const resNbsp = parseDiceExpression('1d20\u00A0+\u00A05');
      expect(resNbsp.count).toBe(1);
      expect(resNbsp.faces).toBe(20);
      expect(resNbsp.modifier).toBe(5);

      const resFullWidth = parseDiceExpression('1d20\u3000+\u30005');
      expect(resFullWidth.count).toBe(1);
      expect(resFullWidth.faces).toBe(20);
      expect(resFullWidth.modifier).toBe(5);
    });

    it('should support compact syntax without spaces between tokens', () => {
      const res1 = parseDiceExpression('1d20adv+5');
      expect(res1.advantageMode).toBe('advantage');
      expect(res1.modifier).toBe(5);

      const res2 = parseDiceExpression('adv1d20+5');
      expect(res2.advantageMode).toBe('advantage');
      expect(res2.modifier).toBe(5);

      const res3 = parseDiceExpression('dis1d20-3');
      expect(res3.advantageMode).toBe('disadvantage');
      expect(res3.modifier).toBe(-3);

      const res4 = parseDiceExpression('4D6KH3+2');
      expect(res4.keepHighest).toBe(3);
      expect(res4.modifier).toBe(2);
    });
  });

  describe('Security Bounds & Error Handling', () => {
    it('should reject non-string inputs', () => {
      // @ts-expect-error test invalid type
      expect(() => parseDiceExpression(null)).toThrow(DiceParseError);
      // @ts-expect-error test invalid type
      expect(() => parseDiceExpression(123)).toThrow(DiceParseError);
    });

    it('should reject empty or whitespace-only strings', () => {
      expect(() => parseDiceExpression('')).toThrow(DiceParseError);
      expect(() => parseDiceExpression('   ')).toThrow(DiceParseError);
    });

    it('should accept exactly 60 characters and reject 61 characters', () => {
      const exact60 = '1d20' + ' '.repeat(56);
      expect(exact60.length).toBe(60);
      expect(parseDiceExpression(exact60).count).toBe(1);

      const tooLong61 = '1d20' + ' '.repeat(57);
      expect(tooLong61.length).toBe(61);
      expect(() => parseDiceExpression(tooLong61)).toThrow(
        /exceeds maximum length of 60 characters/
      );
    });

    it('should accept boundary values for modifiers (-30 and +30)', () => {
      expect(parseDiceExpression('1d20 - 30').modifier).toBe(-30);
      expect(parseDiceExpression('1d20 + 30').modifier).toBe(30);
    });

    it('should accept boundary values for dice counts (1 and 20)', () => {
      expect(parseDiceExpression('1d20').count).toBe(1);
      expect(parseDiceExpression('20d6').count).toBe(20);
    });

    it('should accept boundary values for keep-highest (kh1 and kh4 on 4d6)', () => {
      expect(parseDiceExpression('4d6kh1').keepHighest).toBe(1);
      expect(parseDiceExpression('4d6kh4').keepHighest).toBe(4);
    });

    it('should reject dice count outside 1..20', () => {
      expect(() => parseDiceExpression('0d20')).toThrow(/Dice count must be between 1 and 20/);
      expect(() => parseDiceExpression('21d6')).toThrow(/Dice count must be between 1 and 20/);
    });

    it('should reject invalid die faces (valid: d4, d6, d8, d10, d12, d20, d100)', () => {
      expect(() => parseDiceExpression('1d3')).toThrow(/Invalid die face d3/);
      expect(() => parseDiceExpression('1d5')).toThrow(/Invalid die face d5/);
      expect(() => parseDiceExpression('1d7')).toThrow(/Invalid die face d7/);
      expect(() => parseDiceExpression('1d30')).toThrow(/Invalid die face d30/);
      expect(() => parseDiceExpression('1d50')).toThrow(/Invalid die face d50/);
    });

    it('should reject modifiers outside -30..+30', () => {
      expect(() => parseDiceExpression('1d20 + 31')).toThrow(
        /Modifier must be between -30 and \+30/
      );
      expect(() => parseDiceExpression('1d20 - 31')).toThrow(
        /Modifier must be between -30 and \+30/
      );
    });

    it('should reject advantage/disadvantage on non-d20 or multi-dice', () => {
      expect(() => parseDiceExpression('2d6 adv')).toThrow(
        /Advantage and disadvantage can only be applied to a single d20 roll/
      );
      expect(() => parseDiceExpression('2d20 adv')).toThrow(
        /Advantage and disadvantage can only be applied to a single d20 roll/
      );
      expect(() => parseDiceExpression('1d12 dis')).toThrow(
        /Advantage and disadvantage can only be applied to a single d20 roll/
      );
    });

    it('should reject conflicting or multiple advantage/disadvantage specifications', () => {
      expect(() => parseDiceExpression('1d20 adv dis')).toThrow(
        /Cannot specify advantage\/disadvantage multiple times/
      );
      expect(() => parseDiceExpression('adv 1d20 adv')).toThrow(
        /Cannot specify advantage\/disadvantage multiple times/
      );
    });

    it('should reject combining keep-highest with advantage/disadvantage', () => {
      expect(() => parseDiceExpression('4d6kh3 adv')).toThrow(
        /Cannot combine keep-highest \(kh\) with advantage or disadvantage/
      );
      expect(() => parseDiceExpression('adv 4d6kh3')).toThrow(
        /Cannot combine keep-highest \(kh\) with advantage or disadvantage/
      );
    });

    it('should reject keep-highest when K > N or K < 1', () => {
      expect(() => parseDiceExpression('4d6kh5')).toThrow(
        /Cannot keep 5 dice when only rolling 4 dice/
      );
      expect(() => parseDiceExpression('4d6kh0')).toThrow(
        /Keep-highest count must be at least 1/
      );
    });

    it('should reject malformed or incomplete expressions with friendly messages', () => {
      expect(() => parseDiceExpression('1d')).toThrow(/Expected number of faces after "d"/);
      expect(() => parseDiceExpression('1d20+')).toThrow(/Expected modifier number after "\+"/);
      expect(() => parseDiceExpression('1d20-')).toThrow(/Expected modifier number after "-"/);
      expect(() => parseDiceExpression('1d20*2')).toThrow(/Unexpected character "\*"/);
      expect(() => parseDiceExpression('1d20 foo')).toThrow(/Unrecognized token "foo"/);
      expect(() => parseDiceExpression('20')).toThrow(/Expected "d" after dice count/);
    });

    it('should reject numbers exceeding maximum allowed digits (e.g. 99999999999999999999d6)', () => {
      expect(() => parseDiceExpression('99999999999999999999d6')).toThrow(
        /exceeds maximum allowed digits \(4\)/
      );
      expect(() => parseDiceExpression('1d99999')).toThrow(
        /exceeds maximum allowed digits \(4\)/
      );
      expect(() => parseDiceExpression('1d20+12345')).toThrow(
        /exceeds maximum allowed digits \(4\)/
      );
    });

    it('should handle all dangerous input cases specified in security review', () => {
      // 1000000d1000000
      expect(() => parseDiceExpression('1000000d1000000')).toThrowError(
        'Number "1000000" exceeds maximum allowed digits (4) at position 0'
      );

      // 21d6
      expect(() => parseDiceExpression('21d6')).toThrowError(
        'Dice count must be between 1 and 20 (got 21)'
      );

      // 1d7
      expect(() => parseDiceExpression('1d7')).toThrowError(
        'Invalid die face d7. Valid dice are d4, d6, d8, d10, d12, d20, d100'
      );

      // 1d20+31
      expect(() => parseDiceExpression('1d20+31')).toThrowError(
        'Modifier must be between -30 and +30 (got 31)'
      );

      // ข้อความยาวเกิน 60
      const tooLong = '1d20 + 5' + ' '.repeat(53);
      expect(tooLong.length).toBe(61);
      expect(() => parseDiceExpression(tooLong)).toThrowError(
        'Dice expression exceeds maximum length of 60 characters (length: 61)'
      );

      // สตริงว่าง
      expect(() => parseDiceExpression('')).toThrowError(
        'Dice expression cannot be empty'
      );
      expect(() => parseDiceExpression('   ')).toThrowError(
        'Dice expression cannot be empty'
      );

      // d20 (valid default 1d20)
      const validD20 = parseDiceExpression('d20');
      expect(validD20.count).toBe(1);
      expect(validD20.faces).toBe(20);
      expect(validD20.modifier).toBe(0);

      // 1d20++5
      expect(() => parseDiceExpression('1d20++5')).toThrowError(
        'Expected modifier number after "+" at position 4'
      );

      // adv adv 1d20
      expect(() => parseDiceExpression('adv adv 1d20')).toThrowError(
        'Expected dice notation (e.g., 1d20) at position 4'
      );

      // kh0
      expect(() => parseDiceExpression('kh0')).toThrowError(
        'Expected dice notation (e.g., 1d20) at position 0'
      );

      // 4d6kh5
      expect(() => parseDiceExpression('4d6kh5')).toThrowError(
        'Cannot keep 5 dice when only rolling 4 dice'
      );

      // emoji
      expect(() => parseDiceExpression('1d20 🎲')).toThrowError(
        'Unexpected character "🎲" at position 5'
      );

      // ตัวเลขยาวมาก
      expect(() => parseDiceExpression('99999999999999999999d6')).toThrowError(
        'Number "99999999999999999999" exceeds maximum allowed digits (4) at position 0'
      );
    });
  });
});
