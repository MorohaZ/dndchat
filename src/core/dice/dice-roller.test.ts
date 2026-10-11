import { describe, it, expect } from 'vitest';
import { DiceRoller, rollDice, evaluateRoll } from './dice-roller';
import { FakeRandomSource } from './random-source';
import { DiceParseError } from './dice-parser';

describe('DiceRoller', () => {
  describe('Normal Rolls', () => {
    it('should roll single d20 and compute totals correctly', () => {
      const fake = new FakeRandomSource([15]);
      const roller = new DiceRoller(fake);
      const res = roller.roll('1d20 + 5');

      expect(res.rolls).toEqual([15]);
      expect(res.keptRolls).toEqual([15]);
      expect(res.droppedRolls).toEqual([]);
      expect(res.subtotal).toBe(15);
      expect(res.modifier).toBe(5);
      expect(res.total).toBe(20);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(false);
    });

    it('should detect natural 20 critical hit', () => {
      const fake = new FakeRandomSource([20]);
      const res = rollDice('1d20 + 3', fake);

      expect(res.rolls).toEqual([20]);
      expect(res.keptRolls).toEqual([20]);
      expect(res.total).toBe(23);
      expect(res.isCrit).toBe(true);
      expect(res.isFumble).toBe(false);
    });

    it('should detect natural 1 critical fumble', () => {
      const fake = new FakeRandomSource([1]);
      const res = rollDice('1d20 - 2', fake);

      expect(res.rolls).toEqual([1]);
      expect(res.keptRolls).toEqual([1]);
      expect(res.total).toBe(-1);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(true);
    });

    it('should roll multiple dice (e.g. 3d6)', () => {
      const fake = new FakeRandomSource([4, 2, 6]);
      const res = rollDice('3d6 + 2', fake);

      expect(res.rolls).toEqual([4, 2, 6]);
      expect(res.keptRolls).toEqual([4, 2, 6]);
      expect(res.droppedRolls).toEqual([]);
      expect(res.subtotal).toBe(12);
      expect(res.modifier).toBe(2);
      expect(res.total).toBe(14);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(false);
    });

    it('should NOT trigger crit or fumble on multi-dice rolls (e.g. 2d20, 4d20, 3d20kh2)', () => {
      const fake2d20 = new FakeRandomSource([20, 1]);
      const res2d20 = rollDice('2d20', fake2d20);
      expect(res2d20.rolls).toEqual([20, 1]);
      expect(res2d20.keptRolls).toEqual([20, 1]);
      expect(res2d20.isCrit).toBe(false);
      expect(res2d20.isFumble).toBe(false);

      const fake4d20 = new FakeRandomSource([20, 15, 1, 10]);
      const res4d20 = rollDice('4d20', fake4d20);
      expect(res4d20.rolls).toEqual([20, 15, 1, 10]);
      expect(res4d20.isCrit).toBe(false);
      expect(res4d20.isFumble).toBe(false);

      const fake3d20kh2 = new FakeRandomSource([20, 19, 1]);
      const res3d20kh2 = rollDice('3d20kh2', fake3d20kh2);
      expect(res3d20kh2.keptRolls).toEqual([20, 19]);
      expect(res3d20kh2.droppedRolls).toEqual([1]);
      expect(res3d20kh2.isCrit).toBe(false);
      expect(res3d20kh2.isFumble).toBe(false);
    });
  });

  describe('Advantage Rolls (2d20 keep highest)', () => {
    it('should roll 2 dice and keep the higher roll', () => {
      const fake = new FakeRandomSource([12, 18]);
      const res = rollDice('1d20 adv + 4', fake);

      expect(res.rolls).toEqual([12, 18]);
      expect(res.keptRolls).toEqual([18]);
      expect(res.droppedRolls).toEqual([12]);
      expect(res.subtotal).toBe(18);
      expect(res.total).toBe(22);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(false);
    });

    it('should trigger crit when one of the dice is 20 even if the other is 1', () => {
      const fake = new FakeRandomSource([1, 20]);
      const res = rollDice('adv 1d20 + 2', fake);

      expect(res.rolls).toEqual([1, 20]);
      expect(res.keptRolls).toEqual([20]);
      expect(res.droppedRolls).toEqual([1]);
      expect(res.isCrit).toBe(true);
      expect(res.isFumble).toBe(false);
    });

    it('should only fumble on advantage if BOTH dice are 1', () => {
      const fake = new FakeRandomSource([1, 1]);
      const res = rollDice('1d20 adv', fake);

      expect(res.rolls).toEqual([1, 1]);
      expect(res.keptRolls).toEqual([1]);
      expect(res.droppedRolls).toEqual([1]);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(true);
    });

    it('should not fumble on advantage if one die is 1 and other is higher', () => {
      const fake = new FakeRandomSource([1, 14]);
      const res = rollDice('1d20 adv', fake);

      expect(res.keptRolls).toEqual([14]);
      expect(res.droppedRolls).toEqual([1]);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(false);
    });
  });

  describe('Disadvantage Rolls (2d20 keep lowest)', () => {
    it('should roll 2 dice and keep the lower roll', () => {
      const fake = new FakeRandomSource([15, 8]);
      const res = rollDice('1d20 dis - 1', fake);

      expect(res.rolls).toEqual([15, 8]);
      expect(res.keptRolls).toEqual([8]);
      expect(res.droppedRolls).toEqual([15]);
      expect(res.subtotal).toBe(8);
      expect(res.total).toBe(7);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(false);
    });

    it('should trigger fumble when one of the dice is 1 even if the other is 20', () => {
      const fake = new FakeRandomSource([20, 1]);
      const res = rollDice('dis 1d20', fake);

      expect(res.rolls).toEqual([20, 1]);
      expect(res.keptRolls).toEqual([1]);
      expect(res.droppedRolls).toEqual([20]);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(true);
    });

    it('should only crit on disadvantage if BOTH dice are 20', () => {
      const fake = new FakeRandomSource([20, 20]);
      const res = rollDice('1d20 dis', fake);

      expect(res.rolls).toEqual([20, 20]);
      expect(res.keptRolls).toEqual([20]);
      expect(res.droppedRolls).toEqual([20]);
      expect(res.isCrit).toBe(true);
      expect(res.isFumble).toBe(false);
    });

    it('should not crit on disadvantage if one is 20 and the other is lower', () => {
      const fake = new FakeRandomSource([20, 17]);
      const res = rollDice('1d20 dis', fake);

      expect(res.keptRolls).toEqual([17]);
      expect(res.droppedRolls).toEqual([20]);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(false);
    });
  });

  describe('Keep Highest (kh) Rolls', () => {
    it('should roll 4d6kh3, drop lowest die, and sum highest 3', () => {
      // rolls: 3, 5, 2, 6 -> sorted: 6, 5, 3, 2 -> kept: [6, 5, 3], dropped: [2]
      const fake = new FakeRandomSource([3, 5, 2, 6]);
      const res = rollDice('4d6kh3', fake);

      expect(res.rolls).toEqual([3, 5, 2, 6]);
      expect(res.keptRolls).toEqual([6, 5, 3]);
      expect(res.droppedRolls).toEqual([2]);
      expect(res.subtotal).toBe(14);
      expect(res.total).toBe(14);
      expect(res.isCrit).toBe(false);
      expect(res.isFumble).toBe(false);
    });

    it('should apply modifier with keep highest (4d6kh3 + 2)', () => {
      const fake = new FakeRandomSource([4, 4, 4, 1]);
      const res = rollDice('4d6kh3 + 2', fake);

      expect(res.keptRolls).toEqual([4, 4, 4]);
      expect(res.droppedRolls).toEqual([1]);
      expect(res.subtotal).toBe(12);
      expect(res.modifier).toBe(2);
      expect(res.total).toBe(14);
    });

    it('should not mark crit or fumble on 2d20kh1 because count is 2 (not single d20)', () => {
      // rolls [20, 1] -> kept [20], dropped [1] -> crit false, fumble false (count is 2)
      const fakeCrit = new FakeRandomSource([20, 1]);
      const resCrit = rollDice('2d20kh1', fakeCrit);
      expect(resCrit.keptRolls).toEqual([20]);
      expect(resCrit.droppedRolls).toEqual([1]);
      expect(resCrit.isCrit).toBe(false);
      expect(resCrit.isFumble).toBe(false);

      // rolls [10, 1] -> kept [10], dropped [1] -> crit false, fumble false
      const fakeNormal = new FakeRandomSource([10, 1]);
      const resNormal = rollDice('2d20kh1', fakeNormal);
      expect(resNormal.keptRolls).toEqual([10]);
      expect(resNormal.droppedRolls).toEqual([1]);
      expect(resNormal.isCrit).toBe(false);
      expect(resNormal.isFumble).toBe(false);

      // rolls [1, 1] -> kept [1], dropped [1] -> crit false, fumble false
      const fakeFumble = new FakeRandomSource([1, 1]);
      const resFumble = rollDice('2d20kh1', fakeFumble);
      expect(resFumble.keptRolls).toEqual([1]);
      expect(resFumble.droppedRolls).toEqual([1]);
      expect(resFumble.isCrit).toBe(false);
      expect(resFumble.isFumble).toBe(false);
    });
  });

  describe('Defense in Depth Validation (evaluateRoll)', () => {
    const fake = new FakeRandomSource([5]);

    it('should throw DiceParseError when count exceeds MAX_DICE_COUNT (e.g. 21)', () => {
      const invalidExpr = {
        raw: '21d6',
        count: 21,
        faces: 6,
        modifier: 0,
        advantageMode: 'normal' as const,
      };
      expect(() => evaluateRoll(invalidExpr, fake)).toThrowError(DiceParseError);
    });

    it('should throw DiceParseError when count is less than 1', () => {
      const invalidExpr = {
        raw: '0d6',
        count: 0,
        faces: 6,
        modifier: 0,
        advantageMode: 'normal' as const,
      };
      expect(() => evaluateRoll(invalidExpr, fake)).toThrowError(DiceParseError);
    });

    it('should throw DiceParseError when faces is not a valid die face', () => {
      const invalidExpr = {
        raw: '1d7',
        count: 1,
        faces: 7,
        modifier: 0,
        advantageMode: 'normal' as const,
      };
      expect(() => evaluateRoll(invalidExpr, fake)).toThrowError(DiceParseError);
    });

    it('should throw DiceParseError when modifier exceeds bounds (-31 or +31)', () => {
      const invalidPlus = {
        raw: '1d20+31',
        count: 1,
        faces: 20,
        modifier: 31,
        advantageMode: 'normal' as const,
      };
      expect(() => evaluateRoll(invalidPlus, fake)).toThrowError(DiceParseError);

      const invalidMinus = {
        raw: '1d20-31',
        count: 1,
        faces: 20,
        modifier: -31,
        advantageMode: 'normal' as const,
      };
      expect(() => evaluateRoll(invalidMinus, fake)).toThrowError(DiceParseError);
    });

    it('should throw DiceParseError when keepHighest is invalid', () => {
      const invalidKhOver = {
        raw: '4d6kh5',
        count: 4,
        faces: 6,
        modifier: 0,
        advantageMode: 'normal' as const,
        keepHighest: 5,
      };
      expect(() => evaluateRoll(invalidKhOver, fake)).toThrowError(DiceParseError);

      const invalidKhZero = {
        raw: '4d6kh0',
        count: 4,
        faces: 6,
        modifier: 0,
        advantageMode: 'normal' as const,
        keepHighest: 0,
      };
      expect(() => evaluateRoll(invalidKhZero, fake)).toThrowError(DiceParseError);
    });

    it('should throw DiceParseError when advantage is configured on multi-dice (count > 1)', () => {
      const invalidAdvCount = {
        raw: '2d20 adv',
        count: 2,
        faces: 20,
        modifier: 0,
        advantageMode: 'advantage' as const,
      };
      expect(() => evaluateRoll(invalidAdvCount, fake)).toThrowError(
        'Advantage and disadvantage can only be applied to a single die roll'
      );
    });

    it('should support advantage/disadvantage with faces other than 20 without triggering crit or fumble', () => {
      // 1d6 adv with rolls [2, 5] -> kept [5]
      const fakeD6Adv = new FakeRandomSource([2, 5]);
      const resD6Adv = evaluateRoll(
        {
          raw: '1d6 adv',
          count: 1,
          faces: 6,
          modifier: 0,
          advantageMode: 'advantage',
        },
        fakeD6Adv
      );
      expect(resD6Adv.rolls).toEqual([2, 5]);
      expect(resD6Adv.keptRolls).toEqual([5]);
      expect(resD6Adv.droppedRolls).toEqual([2]);
      expect(resD6Adv.isCrit).toBe(false);
      expect(resD6Adv.isFumble).toBe(false);

      // 1d6 dis with rolls [6, 1] -> kept [1], but faces is 6, so isFumble must remain false
      const fakeD6Dis = new FakeRandomSource([6, 1]);
      const resD6Dis = evaluateRoll(
        {
          raw: '1d6 dis',
          count: 1,
          faces: 6,
          modifier: 0,
          advantageMode: 'disadvantage',
        },
        fakeD6Dis
      );
      expect(resD6Dis.rolls).toEqual([6, 1]);
      expect(resD6Dis.keptRolls).toEqual([1]);
      expect(resD6Dis.droppedRolls).toEqual([6]);
      expect(resD6Dis.isCrit).toBe(false);
      expect(resD6Dis.isFumble).toBe(false);
    });
  });

  describe('Result Immutability and Crypto Default', () => {
    it('should prevent mutation of roll arrays', () => {
      const fake = new FakeRandomSource([10]);
      const res = rollDice('1d20', fake);

      expect(Object.isFrozen(res.rolls)).toBe(true);
      expect(Object.isFrozen(res.keptRolls)).toBe(true);
      expect(Object.isFrozen(res.droppedRolls)).toBe(true);
    });

    it('should roll using default CryptoRandomSource without errors', () => {
      const res = rollDice('2d6 + 3');
      expect(res.rolls.length).toBe(2);
      expect(res.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(res.rolls[0]).toBeLessThanOrEqual(6);
      expect(res.rolls[1]).toBeGreaterThanOrEqual(1);
      expect(res.rolls[1]).toBeLessThanOrEqual(6);
      expect(res.total).toBe(res.rolls[0] + res.rolls[1] + 3);
    });
  });
});
