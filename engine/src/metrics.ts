import { sumCents, type Cents } from "./money.js";
import type { AssessedLiability } from "./liabilities.js";
import type { Household } from "./types.js";
import type { PolicySnapshot } from "./policy/types.js";

export interface NmsResult {
  assessedNetIncomeMonthlyCents: Cents;
  assessedExpensesMonthlyCents: Cents;
  assessedLiabilitiesMonthlyCents: Cents;
  assessedProposedRepaymentMonthlyCents: Cents;
  netMonthlySurplusCents: Cents;
  pass: boolean;
}

/** NMS = assessed net income − assessed expenses − assessed liabilities − assessed proposed repayment (policy §7.1). */
export function computeNms(
  assessedNetIncomeMonthlyCents: Cents,
  assessedExpensesMonthlyCents: Cents,
  assessedLiabilitiesMonthlyCents: Cents,
  assessedProposedRepaymentMonthlyCents: Cents,
): NmsResult {
  const netMonthlySurplusCents =
    assessedNetIncomeMonthlyCents -
    assessedExpensesMonthlyCents -
    assessedLiabilitiesMonthlyCents -
    assessedProposedRepaymentMonthlyCents;
  return {
    assessedNetIncomeMonthlyCents,
    assessedExpensesMonthlyCents,
    assessedLiabilitiesMonthlyCents,
    assessedProposedRepaymentMonthlyCents,
    netMonthlySurplusCents,
    pass: netMonthlySurplusCents >= 0,
  };
}

export interface DtiResult {
  totalDebtCents: Cents;
  grossAnnualHouseholdIncomeCents: Cents;
  dti: number;
  highDtiFlag: boolean;
  threshold: number;
}

/** DTI = total debt incl. proposed loan ÷ gross annual income (APRA convention, policy §7.2). DTI >= 6.0 is a flag, never a decline (DL-009). */
export function computeDti(
  existingLiabilities: readonly AssessedLiability[],
  household: Household,
  proposedLoanAmountCents: Cents,
  grossAnnualHouseholdIncomeCents: Cents,
  policy: PolicySnapshot,
): DtiResult {
  const hecsDebtCents = sumCents(
    household.applicants.filter((a) => a.hasHecsDebt).map((a) => a.hecsBalanceCents),
  );
  const totalDebtCents =
    sumCents(existingLiabilities.map((l) => l.householdDebtCents)) + hecsDebtCents + proposedLoanAmountCents;
  const dti = grossAnnualHouseholdIncomeCents === 0 ? 0 : totalDebtCents / grossAnnualHouseholdIncomeCents;
  return {
    totalDebtCents,
    grossAnnualHouseholdIncomeCents,
    dti,
    highDtiFlag: dti >= policy.dtiFlagThreshold,
    threshold: policy.dtiFlagThreshold,
  };
}

export interface LvrResult {
  proposedLoanAmountCents: Cents;
  propertyValueCents: Cents;
  lvr: number;
  highLvrFlag: boolean;
  prominentWarning: boolean;
  flagThreshold: number;
  warningThreshold: number;
}

/** LVR = proposed loan ÷ property value (policy §7.3). >80% flags, >90% is a prominent warning. */
export function computeLvr(
  proposedLoanAmountCents: Cents,
  propertyValueCents: Cents,
  policy: PolicySnapshot,
): LvrResult {
  const lvr = propertyValueCents === 0 ? 0 : proposedLoanAmountCents / propertyValueCents;
  const flagThreshold = policy.lvrFlagThresholdBps / 10_000;
  const warningThreshold = policy.lvrWarningThresholdBps / 10_000;
  return {
    proposedLoanAmountCents,
    propertyValueCents,
    lvr,
    highLvrFlag: lvr > flagThreshold,
    prominentWarning: lvr > warningThreshold,
    flagThreshold,
    warningThreshold,
  };
}
