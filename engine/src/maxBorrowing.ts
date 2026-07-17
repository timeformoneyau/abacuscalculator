import { roundHalfAwayFromZero, type Bps, type Cents } from "./money.js";

export interface MaxBorrowingAssumptions {
  assessmentRateBps: Bps;
  termMonths: number;
  repaymentType: "principalAndInterest";
  capacityMonthlyCents: Cents;
}

export interface MaxBorrowingResult {
  assumptions: MaxBorrowingAssumptions;
  maxLoanAmountCents: Cents;
}

/**
 * Maximum Borrowing Amount (policy §7.4): the largest loan where NMS = $0,
 * at the assessment rate, the entered term, and P&I repayments. P&I
 * repayment is a linear function of loan amount for a fixed rate/term, so
 * the "iterate until NMS = 0" solver has an exact closed-form inverse —
 * used here instead of numeric iteration to keep the result deterministic.
 */
export function solveMaxBorrowing(
  capacityMonthlyCents: Cents,
  assessmentRateBps: Bps,
  termMonths: number,
): MaxBorrowingResult {
  const capacity = Math.max(0, capacityMonthlyCents);
  const monthlyRate = assessmentRateBps / 10_000 / 12;
  const factor = monthlyRate === 0 ? 1 / termMonths : monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));
  const maxLoanAmountCents = capacity === 0 ? 0 : roundHalfAwayFromZero(capacity / factor);
  return {
    assumptions: {
      assessmentRateBps,
      termMonths,
      repaymentType: "principalAndInterest",
      capacityMonthlyCents: capacity,
    },
    maxLoanAmountCents,
  };
}
