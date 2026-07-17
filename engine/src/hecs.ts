import { applyBps, clampCents, type Cents } from "./money.js";
import type { HecsBand } from "./policy/types.js";

export interface HecsComputation {
  taxableIncomeAnnualCents: Cents;
  investmentLossAddBackAnnualCents: Cents;
  repaymentIncomeAnnualCents: Cents;
  band: HecsBand;
  repaymentAnnualCents: Cents;
  repaymentMonthlyCents: Cents;
}

function findBand(repaymentIncomeCents: Cents, bands: readonly HecsBand[]): HecsBand {
  const band = bands.find((b) => b.upperBoundCents === null || repaymentIncomeCents <= b.upperBoundCents);
  if (!band) {
    throw new Error("HECS band table does not cover the given repayment income");
  }
  return band;
}

/**
 * HECS/HELP marginal repayment (policy §3.3). Repayment income = taxable
 * income + net investment losses added back — so a Regime A negative
 * gearing loss lowers tax but NOT the HECS commitment (CLAUDE.md domain trap).
 */
export function computeHecsRepayment(
  taxableIncomeAnnualCents: Cents,
  investmentLossAddBackAnnualCents: Cents,
  bands: readonly HecsBand[],
): HecsComputation {
  const repaymentIncomeAnnualCents = taxableIncomeAnnualCents + Math.max(0, investmentLossAddBackAnnualCents);
  const band = findBand(Math.max(0, repaymentIncomeAnnualCents), bands);
  const repaymentAnnualCents = band.flatOnTotal
    ? applyBps(clampCents(repaymentIncomeAnnualCents), band.marginalRateBps)
    : clampCents(band.baseCents + applyBps(repaymentIncomeAnnualCents - band.thresholdCents, band.marginalRateBps));
  return {
    taxableIncomeAnnualCents,
    investmentLossAddBackAnnualCents,
    repaymentIncomeAnnualCents,
    band,
    repaymentAnnualCents,
    repaymentMonthlyCents: Math.round(repaymentAnnualCents / 12),
  };
}
