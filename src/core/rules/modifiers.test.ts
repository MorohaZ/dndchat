import { describe, it, expect } from 'vitest';
import {
  getAbilityModifier,
  getProficiencyBonus,
  formatModifier,
} from './modifiers';

describe('Modifiers & SRD Rules (src/core/rules/modifiers.ts)', () => {
  describe('Ability Score Modifiers (Scores 1 to 30)', () => {
    it('should correctly calculate modifiers for canonical ability score breakpoints', () => {
      expect(getAbilityModifier(1)).toBe(-5);
      expect(getAbilityModifier(2)).toBe(-4);
      expect(getAbilityModifier(3)).toBe(-4);
      expect(getAbilityModifier(4)).toBe(-3);
      expect(getAbilityModifier(5)).toBe(-3);
      expect(getAbilityModifier(6)).toBe(-2);
      expect(getAbilityModifier(7)).toBe(-2);
      expect(getAbilityModifier(8)).toBe(-1);
      expect(getAbilityModifier(9)).toBe(-1);
      expect(getAbilityModifier(10)).toBe(0);
      expect(getAbilityModifier(11)).toBe(0);
      expect(getAbilityModifier(12)).toBe(1);
      expect(getAbilityModifier(13)).toBe(1);
      expect(getAbilityModifier(14)).toBe(2);
      expect(getAbilityModifier(16)).toBe(3);
      expect(getAbilityModifier(18)).toBe(4);
      expect(getAbilityModifier(20)).toBe(5);
      expect(getAbilityModifier(30)).toBe(10);
    });

    it('should match floor((score - 10) / 2) for all integer scores 1 to 30', () => {
      for (let score = 1; score <= 30; score++) {
        expect(getAbilityModifier(score)).toBe(Math.floor((score - 10) / 2));
      }
    });

    it('should reject scores outside 1 to 30 with RangeError', () => {
      expect(() => getAbilityModifier(0)).toThrowError(RangeError);
      expect(() => getAbilityModifier(-1)).toThrowError(RangeError);
      expect(() => getAbilityModifier(31)).toThrowError(RangeError);
      expect(() => getAbilityModifier(100)).toThrowError(RangeError);
    });

    it('should reject non-integer scores with TypeError', () => {
      expect(() => getAbilityModifier(10.5)).toThrowError(TypeError);
      expect(() => getAbilityModifier(NaN)).toThrowError(TypeError);
      expect(() => getAbilityModifier(Infinity)).toThrowError(TypeError);
    });
  });

  describe('Proficiency Bonus by Character Level (Levels 1 to 20)', () => {
    it('should return +2 for levels 1 to 4', () => {
      for (let level = 1; level <= 4; level++) {
        expect(getProficiencyBonus(level)).toBe(2);
      }
    });

    it('should return +3 for levels 5 to 8', () => {
      for (let level = 5; level <= 8; level++) {
        expect(getProficiencyBonus(level)).toBe(3);
      }
    });

    it('should return +4 for levels 9 to 12', () => {
      for (let level = 9; level <= 12; level++) {
        expect(getProficiencyBonus(level)).toBe(4);
      }
    });

    it('should return +5 for levels 13 to 16', () => {
      for (let level = 13; level <= 16; level++) {
        expect(getProficiencyBonus(level)).toBe(5);
      }
    });

    it('should return +6 for levels 17 to 20', () => {
      for (let level = 17; level <= 20; level++) {
        expect(getProficiencyBonus(level)).toBe(6);
      }
    });

    it('should reject levels outside 1 to 20 with RangeError', () => {
      expect(() => getProficiencyBonus(0)).toThrowError(RangeError);
      expect(() => getProficiencyBonus(-1)).toThrowError(RangeError);
      expect(() => getProficiencyBonus(21)).toThrowError(RangeError);
      expect(() => getProficiencyBonus(100)).toThrowError(RangeError);
    });

    it('should reject non-integer levels with TypeError', () => {
      expect(() => getProficiencyBonus(3.5)).toThrowError(TypeError);
      expect(() => getProficiencyBonus(NaN)).toThrowError(TypeError);
    });
  });

  describe('formatModifier helper', () => {
    it('should format positive and zero numbers with leading "+"', () => {
      expect(formatModifier(5)).toBe('+5');
      expect(formatModifier(0)).toBe('+0');
    });

    it('should format negative numbers with leading "-"', () => {
      expect(formatModifier(-3)).toBe('-3');
      expect(formatModifier(-1)).toBe('-1');
    });

    it('should reject non-integers', () => {
      expect(() => formatModifier(2.5)).toThrowError(TypeError);
    });
  });
});
