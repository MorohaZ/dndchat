/**
 * Calculates the ability score modifier according to D&D 5e SRD 5.2.1.
 * Formula: floor((score - 10) / 2)
 *
 * @param score Ability score (integer from 1 to 30)
 * @returns Ability modifier (-5 to +10)
 */
export function getAbilityModifier(score: number): number {
  if (!Number.isInteger(score)) {
    throw new TypeError(`Ability score must be an integer, got ${score}`);
  }
  if (score < 1 || score > 30) {
    throw new RangeError(
      `Ability score must be between 1 and 30, got ${score}`
    );
  }
  return Math.floor((score - 10) / 2);
}

/**
 * Calculates the proficiency bonus for a character level according to D&D 5e SRD 5.2.1.
 * - Levels 1-4:   +2
 * - Levels 5-8:   +3
 * - Levels 9-12:  +4
 * - Levels 13-16: +5
 * - Levels 17-20: +6
 *
 * @param level Character level (integer from 1 to 20)
 * @returns Proficiency bonus (+2 to +6)
 */
export function getProficiencyBonus(level: number): number {
  if (!Number.isInteger(level)) {
    throw new TypeError(`Character level must be an integer, got ${level}`);
  }
  if (level < 1 || level > 20) {
    throw new RangeError(
      `Character level must be between 1 and 20, got ${level}`
    );
  }
  return Math.floor((level - 1) / 4) + 2;
}

/**
 * Formats a numeric modifier with an explicit sign (e.g. "+5", "-2", "+0").
 */
export function formatModifier(modifier: number): string {
  if (!Number.isInteger(modifier)) {
    throw new TypeError(`Modifier must be an integer, got ${modifier}`);
  }
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

// Aliases for developer convenience
export const calculateAbilityModifier = getAbilityModifier;
export const calculateProficiencyBonus = getProficiencyBonus;
