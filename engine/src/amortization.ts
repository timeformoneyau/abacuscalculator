import { roundHalfAwayFromZero, type Bps, type Cents } from "./money.js";

/** Standard reducing-balance P&I repayment. Handles the r=0 edge case (rate at exactly 0%). */
export function computeMonthlyPrincipalAndInterest(
  balanceCents: Cents,
  annualRateBps: Bps,
  termMonths: number,
): Cents {
  if (termMonths <= 0) {
    throw new Error("termMonths must be positive");
  }
  const monthlyRate = annualRateBps / 10_000 / 12;
  if (monthlyRate === 0) {
    return roundHalfAwayFromZero(balanceCents / termMonths);
  }
  const factor = monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));
  return roundHalfAwayFromZero(balanceCents * factor);
}

/** Assessment rate rule (policy §2.3): higher of (actual rate + buffer) and floor. */
export function resolveAssessmentRateBps(actualRateBps: Bps, bufferBps: Bps, floorRateBps: Bps): Bps {
  return Math.max(actualRateBps + bufferBps, floorRateBps);
}

/**
 * Interest-only facilities are assessed on the P&I repayment over the
 * RESIDUAL P&I term (policy §2: e.g. 5yr IO on a 30yr term -> P&I over 25yr).
 */
export function residualPrincipalAndInterestTermMonths(
  totalTermMonths: number,
  ioRemainingMonths: number | undefined,
): number {
  const ioMonths = ioRemainingMonths ?? 0;
  const residual = totalTermMonths - ioMonths;
  if (residual <= 0) {
    throw new Error("Residual P&I term must be positive after deducting the IO period");
  }
  return residual;
}
