/**
 * All money in the engine is represented as integer cents (AUD) to avoid
 * binary floating-point drift (requirements §4.4, CLAUDE.md).
 */
export type Cents = number;

/** Basis points: 1% = 100bps. Used for all rates so rate math stays integer-driven. */
export type Bps = number;

export function dollarsToCents(dollars: number): Cents {
  return roundHalfAwayFromZero(dollars * 100);
}

export function centsToDollars(cents: Cents): number {
  return cents / 100;
}

/**
 * Round half away from zero (not banker's rounding, not JS's toward-+Infinity
 * Math.round) so negative amounts (losses, shortfalls) round symmetrically
 * with positive ones — required for deterministic, reproducible engine output.
 */
export function roundHalfAwayFromZero(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : -Math.floor(-value + 0.5);
}

/** Applies a basis-point rate to a cents amount, rounding to the nearest cent. */
export function applyBps(amountCents: Cents, bps: Bps): Cents {
  return roundHalfAwayFromZero((amountCents * bps) / 10_000);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, v) => total + v, 0);
}

export function clampCents(value: Cents, min: Cents = 0): Cents {
  return Math.max(min, value);
}
