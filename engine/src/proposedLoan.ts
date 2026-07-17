import type { Cents } from "./money.js";
import {
  computeMonthlyPrincipalAndInterest,
  residualPrincipalAndInterestTermMonths,
  resolveAssessmentRateBps,
} from "./amortization.js";
import type { ProposedLoan } from "./types.js";
import type { PolicySnapshot } from "./policy/types.js";

export interface AssessedProposedLoan {
  rule: string;
  assessmentRateBps: number;
  termMonths: number;
  assessedMonthlyRepaymentCents: Cents;
}

/**
 * Proposed loan assessed repayment (policy §2, §7.4): higher of (product
 * rate + buffer) and floor; interest-only assessed as P&I over the
 * residual P&I term.
 */
export function assessProposedLoan(loan: ProposedLoan, policy: PolicySnapshot): AssessedProposedLoan {
  const assessmentRateBps = resolveAssessmentRateBps(
    loan.productRateBps,
    policy.assessmentRates.bufferBps,
    policy.assessmentRates.floorRateBps,
  );
  const termMonths =
    loan.repaymentType === "interestOnly"
      ? residualPrincipalAndInterestTermMonths(loan.termMonths, loan.ioRemainingMonths)
      : loan.termMonths;
  const assessedMonthlyRepaymentCents = computeMonthlyPrincipalAndInterest(loan.amountCents, assessmentRateBps, termMonths);
  const rule =
    loan.repaymentType === "interestOnly"
      ? `Proposed loan: P&I at higher of (${loan.productRateBps / 100}% + ${policy.assessmentRates.bufferBps / 100}% buffer) and ${policy.assessmentRates.floorRateBps / 100}% floor, over residual P&I term of ${termMonths} months (policy §2)`
      : `Proposed loan: P&I at higher of (${loan.productRateBps / 100}% + ${policy.assessmentRates.bufferBps / 100}% buffer) and ${policy.assessmentRates.floorRateBps / 100}% floor, over ${termMonths} months (policy §2)`;
  return { rule, assessmentRateBps, termMonths, assessedMonthlyRepaymentCents };
}
