import { describe, it, expect } from 'vitest';
import { DiceRoller, rollDice } from './dice-roller';
import { FakeRandomSource } from './random-source';

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

    it('should detect both crit and fumble if both 20 and 1 are rolled in a 2d20 normal roll', () => {
      const fake = new FakeRandomSource([20, 1]);
      const res = rollDice('2d20', fake);

      expect(res.rolls).toEqual([20, 1]);
      expect(res.keptRolls).toEqual([20, 1]);
      expect(res.isCrit).toBe(true);
      expect(res.isFumble).toBe(true);
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

    it('should only check kept dice for crit and fumble on 2d20kh1', () => {
      // rolls [20, 1] -> kept [20], dropped [1] -> crit true, fumble false
      const fakeCrit = new FakeRandomSource([20, 1]);
      const resCrit = rollDice('2d20kh1', fakeCrit);
      expect(resCrit.keptRolls).toEqual([20]);
      expect(resCrit.droppedRolls).toEqual([1]);
      expect(resCrit.isCrit).toBe(true);
      expect(resCrit.isFumble).toBe(false);

      // rolls [10, 1] -> kept [10], dropped [1] -> crit false, fumble false
      const fakeNormal = new FakeRandomSource([10, 1]);
      const resNormal = rollDice('2d20kh1', fakeNormal);
      expect(resNormal.keptRolls).toEqual([10]);
      expect(resNormal.droppedRolls).toEqual([1]);
      expect(resNormal.isCrit).toBe(false);
      expect(resNormal.isFumble).toBe(false);

      // rolls [1, 1] -> kept [1], dropped [1] -> crit false, fumble true
      const fakeFumble = new FakeRandomSource([1, 1]);
      const resFumble = rollDice('2d20kh1', fakeFumble);
      expect(resFumble.keptRolls).toEqual([1]);
      expect(resFumble.droppedRolls).toEqual([1]);
      expect(resFumble.isCrit).toBe(false);
      expect(resFumble.isFumble).toBe(true);
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
