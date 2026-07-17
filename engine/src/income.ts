import { applyBps, sumCents, type Cents } from "./money.js";
import { toMonthly } from "./frequency.js";
import type { Household, IncomeLine } from "./types.js";
import type { PolicySnapshot } from "./policy/types.js";

export interface AssessedIncomeLine {
  line: IncomeLine;
  grossMonthlyCents: Cents;
  shadingBps: number;
  shadingRule: string;
  assessedMonthlyCents: Cents;
}

export interface ApplicantIncomeTotal {
  applicantId: string;
  grossMonthlyCents: Cents;
  assessedMonthlyCents: Cents;
  grossAnnualCents: Cents;
  assessedAnnualCents: Cents;
}

export interface IncomeAssessmentResult {
  lines: AssessedIncomeLine[];
  perApplicant: ApplicantIncomeTotal[];
  householdGrossMonthlyCents: Cents;
  householdAssessedMonthlyCents: Cents;
  householdGrossAnnualCents: Cents;
}

/**
 * Shades every income line per policy §3.1, applying the essential-services
 * overtime override (100% instead of 80%) when the owning applicant's flag
 * is set. Returns full per-line drill-down plus household/applicant totals.
 */
export function assessIncome(
  incomes: readonly IncomeLine[],
  household: Household,
  policy: PolicySnapshot,
): IncomeAssessmentResult {
  const essentialServicesByApplicant = new Map(
    household.applicants.map((a) => [a.id, a.essentialServicesOccupation]),
  );

  const lines: AssessedIncomeLine[] = incomes.map((line) => {
    const grossMonthlyCents = toMonthly(line.amountCents, line.frequency);
    const isEssentialOvertime =
      line.type === "overtime" && essentialServicesByApplicant.get(line.applicantId) === true;
    const shadingBps = isEssentialOvertime
      ? policy.essentialServicesOvertimeShadingBps
      : policy.incomeShadingBps[line.type];
    const shadingRule = isEssentialOvertime
      ? `${line.type} shaded to ${shadingBps / 100}% (essential-services override, policy §3.1.2)`
      : `${line.type} shaded to ${shadingBps / 100}% (policy §3.1)`;
    const assessedMonthlyCents = applyBps(grossMonthlyCents, shadingBps);
    return { line, grossMonthlyCents, shadingBps, shadingRule, assessedMonthlyCents };
  });

  const perApplicant: ApplicantIncomeTotal[] = household.applicants.map((applicant) => {
    const applicantLines = lines.filter((l) => l.line.applicantId === applicant.id);
    const grossMonthlyCents = sumCents(applicantLines.map((l) => l.grossMonthlyCents));
    const assessedMonthlyCents = sumCents(applicantLines.map((l) => l.assessedMonthlyCents));
    return {
      applicantId: applicant.id,
      grossMonthlyCents,
      assessedMonthlyCents,
      grossAnnualCents: grossMonthlyCents * 12,
      assessedAnnualCents: assessedMonthlyCents * 12,
    };
  });

  const householdGrossMonthlyCents = sumCents(perApplicant.map((a) => a.grossMonthlyCents));
  const householdAssessedMonthlyCents = sumCents(perApplicant.map((a) => a.assessedMonthlyCents));

  return {
    lines,
    perApplicant,
    householdGrossMonthlyCents,
    householdAssessedMonthlyCents,
    householdGrossAnnualCents: householdGrossMonthlyCents * 12,
  };
}
