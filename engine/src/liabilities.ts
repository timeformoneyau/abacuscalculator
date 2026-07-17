import { applyBps, roundHalfAwayFromZero, sumCents, type Cents } from "./money.js";
import { toMonthly } from "./frequency.js";
import {
  computeMonthlyPrincipalAndInterest,
  residualPrincipalAndInterestTermMonths,
  resolveAssessmentRateBps,
} from "./amortization.js";
import type { Household, Liability, OwnershipShare } from "./types.js";
import type { PolicySnapshot } from "./policy/types.js";

export interface ApplicantShareLine {
  applicantId: string;
  sharePct: number;
  assessedMonthlyCents: Cents;
}

export interface AssessedLiability {
  liability: Liability;
  rule: string;
  assessmentRateBps?: number;
  termMonths?: number;
  /** Full assessed monthly commitment as if 100% the household's obligation. */
  fullAssessedMonthlyCents: Cents;
  /** Sum of ownership shares held by applicants in this household (vs external co-owners). */
  inHouseholdSharePct: number;
  /** fullAssessedMonthlyCents apportioned to the in-household share — this is what hits the household's NMS. */
  householdAssessedMonthlyCents: Cents;
  applicantShares: ApplicantShareLine[];
  /** Underlying debt balance/limit apportioned to the in-household share — feeds DTI (policy §7.2). */
  householdDebtCents: Cents;
}

function debtAmountCents(liability: Liability): Cents {
  switch (liability.kind) {
    case "existingMortgage":
      return liability.balanceCents;
    case "creditCard":
      return liability.limitCents;
    case "otherLoan":
    case "bnpl":
      return liability.balanceCents;
  }
}

export interface LiabilityAssessmentResult {
  liabilities: AssessedLiability[];
  totalAssessedMonthlyCents: Cents;
}

const SHARE_TOLERANCE_PCT = 0.01;

function validateOwnership(ownership: readonly OwnershipShare[], liabilityId: string): void {
  const total = sumCents(ownership.map((o) => Math.round(o.sharePct * 100))) / 100;
  if (Math.abs(total - 100) > SHARE_TOLERANCE_PCT) {
    throw new Error(`Ownership shares for liability ${liabilityId} sum to ${total}%, must sum to 100%`);
  }
}

function inHouseholdSharePct(ownership: readonly OwnershipShare[], household: Household): number {
  const applicantIds = new Set(household.applicants.map((a) => a.id));
  return sumCents(
    ownership.filter((o) => applicantIds.has(o.applicantId)).map((o) => Math.round(o.sharePct * 100)),
  ) / 100;
}

function applicantShares(
  ownership: readonly OwnershipShare[],
  fullAssessedMonthlyCents: Cents,
): ApplicantShareLine[] {
  return ownership.map((o) => ({
    applicantId: o.applicantId,
    sharePct: o.sharePct,
    assessedMonthlyCents: roundHalfAwayFromZero((fullAssessedMonthlyCents * o.sharePct) / 100),
  }));
}

function assessOne(liability: Liability, household: Household, policy: PolicySnapshot): AssessedLiability {
  validateOwnership(liability.ownership, liability.id);

  let fullAssessedMonthlyCents: Cents;
  let rule: string;
  let assessmentRateBps: number | undefined;
  let termMonths: number | undefined;

  switch (liability.kind) {
    case "existingMortgage": {
      assessmentRateBps = resolveAssessmentRateBps(
        liability.interestRateBps,
        policy.assessmentRates.bufferBps,
        policy.assessmentRates.floorRateBps,
      );
      termMonths =
        liability.repaymentType === "interestOnly"
          ? residualPrincipalAndInterestTermMonths(liability.remainingTermMonths, liability.ioRemainingMonths)
          : liability.remainingTermMonths;
      fullAssessedMonthlyCents = computeMonthlyPrincipalAndInterest(liability.balanceCents, assessmentRateBps, termMonths);
      rule =
        liability.repaymentType === "interestOnly"
          ? `Existing mortgage: P&I at higher of (${liability.interestRateBps / 100}% + ${policy.assessmentRates.bufferBps / 100}% buffer) and ${policy.assessmentRates.floorRateBps / 100}% floor, over residual P&I term of ${termMonths} months (policy §2, §5.1)`
          : `Existing mortgage: P&I at higher of (${liability.interestRateBps / 100}% + ${policy.assessmentRates.bufferBps / 100}% buffer) and ${policy.assessmentRates.floorRateBps / 100}% floor, over ${termMonths} months (policy §5.1)`;
      break;
    }
    case "creditCard": {
      fullAssessedMonthlyCents = applyBps(liability.limitCents, policy.creditCardMonthlyFactorBps);
      rule = `Credit card: ${policy.creditCardMonthlyFactorBps / 100}% of limit per month, regardless of balance (policy §5.2)`;
      break;
    }
    case "otherLoan": {
      fullAssessedMonthlyCents = toMonthly(liability.repaymentAmountCents, liability.frequency);
      rule = "Personal/car loan: actual contractual repayment (policy §5.3)";
      break;
    }
    case "bnpl": {
      fullAssessedMonthlyCents = toMonthly(liability.declaredCommitmentCents, liability.frequency);
      rule = "BNPL/other: actual declared commitment (policy §5.4)";
      break;
    }
  }

  const householdSharePct = inHouseholdSharePct(liability.ownership, household);
  const householdAssessedMonthlyCents = roundHalfAwayFromZero((fullAssessedMonthlyCents * householdSharePct) / 100);
  const householdDebtCents = roundHalfAwayFromZero((debtAmountCents(liability) * householdSharePct) / 100);

  return {
    liability,
    rule,
    assessmentRateBps,
    termMonths,
    fullAssessedMonthlyCents,
    inHouseholdSharePct: householdSharePct,
    householdAssessedMonthlyCents,
    applicantShares: applicantShares(liability.ownership, fullAssessedMonthlyCents),
    householdDebtCents,
  };
}

/**
 * Assesses every liability (policy §5). Shared liabilities are apportioned
 * by ownership % (DL-004): the household's assessed share is the full
 * assessed repayment scaled to the ownership held by applicants on THIS
 * assessment — liabilities wholly owned by co-applicants therefore count
 * once in full, since their shares sum to 100%.
 */
export function assessLiabilities(
  liabilities: readonly Liability[],
  household: Household,
  policy: PolicySnapshot,
): LiabilityAssessmentResult {
  const assessed = liabilities.map((l) => assessOne(l, household, policy));
  return {
    liabilities: assessed,
    totalAssessedMonthlyCents: sumCents(assessed.map((a) => a.householdAssessedMonthlyCents)),
  };
}
