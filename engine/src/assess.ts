import { clampCents, sumCents, type Cents } from "./money.js";
import { assessIncome, type IncomeAssessmentResult } from "./income.js";
import { computeNegativeGearing, type NegativeGearingResult } from "./negativeGearing.js";
import { computeNetIncome, type TaxComputation } from "./tax.js";
import { computeHecsRepayment, type HecsComputation } from "./hecs.js";
import { assessExpenses, type ExpenseAssessment } from "./expenses.js";
import { assessLiabilities, type LiabilityAssessmentResult } from "./liabilities.js";
import { assessProposedLoan, type AssessedProposedLoan } from "./proposedLoan.js";
import { computeDti, computeLvr, computeNms, type DtiResult, type LvrResult, type NmsResult } from "./metrics.js";
import { solveMaxBorrowing, type MaxBorrowingResult } from "./maxBorrowing.js";
import { selectBenchmarkTable, selectTaxTable } from "./policy/select.js";
import type { AssessmentInput, InvestmentProperty } from "./types.js";
import type { PolicySnapshot } from "./policy/types.js";

export interface ApplicantAssessment {
  applicantId: string;
  assessedGrossIncomeAnnualCents: Cents;
  attributedInvestmentTaxableContributionAnnualCents: Cents;
  attributedInvestmentLossAddBackAnnualCents: Cents;
  taxableIncomeAnnualCents: Cents;
  tax: TaxComputation;
  hecs?: HecsComputation;
}

export interface AssessmentResult {
  policyId: string;
  policyLabel: string;
  assessmentDate: string;
  income: IncomeAssessmentResult;
  negativeGearing: NegativeGearingResult;
  applicants: ApplicantAssessment[];
  totalAssessedNetIncomeMonthlyCents: Cents;
  totalHecsRepaymentMonthlyCents: Cents;
  expenses: ExpenseAssessment;
  liabilities: LiabilityAssessmentResult;
  totalLiabilitiesIncludingHecsMonthlyCents: Cents;
  proposedLoan: AssessedProposedLoan;
  nms: NmsResult;
  dti: DtiResult;
  lvr: LvrResult;
  maxBorrowing: MaxBorrowingResult;
}

/** Sum of (property net-result contribution) x (applicant's ownership share of that property), for applicants in this household only. */
function attributeToApplicant(
  applicantId: string,
  properties: readonly InvestmentProperty[],
  gearing: NegativeGearingResult,
): { taxableContributionAnnualCents: Cents; lossAddBackAnnualCents: Cents } {
  let taxableContributionAnnualCents = 0;
  let lossAddBackAnnualCents = 0;
  for (const property of properties) {
    const share = property.ownership.find((o) => o.applicantId === applicantId);
    if (!share) continue;
    const result = gearing.properties.find((p) => p.propertyId === property.id);
    if (!result) continue;
    const applicantContribution = (result.taxableContributionAnnualCents * share.sharePct) / 100;
    taxableContributionAnnualCents += applicantContribution;
    if (applicantContribution < 0) {
      lossAddBackAnnualCents += -applicantContribution;
    }
  }
  return {
    taxableContributionAnnualCents: Math.round(taxableContributionAnnualCents),
    lossAddBackAnnualCents: Math.round(lossAddBackAnnualCents),
  };
}

/**
 * Runs a full serviceability assessment. Pure function of
 * (input, policy) — the assessment date drives every effective-dated table
 * lookup and the negative-gearing regime cutoff; nothing reads the system
 * clock (CLAUDE.md). Returns every intermediate value the UI drill-down
 * needs — it must never re-derive figures itself.
 */
export function runAssessment(input: AssessmentInput, policy: PolicySnapshot): AssessmentResult {
  const { household, assessmentDate } = input;

  const income = assessIncome(input.incomes, household, policy);
  const negativeGearing = computeNegativeGearing(input.investmentProperties, policy);
  const taxTable = selectTaxTable(policy, assessmentDate);
  const benchmarkTable = selectBenchmarkTable(policy, assessmentDate);

  const applicants: ApplicantAssessment[] = household.applicants.map((applicant) => {
    const incomeTotal = income.perApplicant.find((a) => a.applicantId === applicant.id);
    const assessedGrossIncomeAnnualCents = incomeTotal?.assessedAnnualCents ?? 0;
    const attribution = attributeToApplicant(applicant.id, input.investmentProperties, negativeGearing);
    const taxableIncomeAnnualCents = assessedGrossIncomeAnnualCents + attribution.taxableContributionAnnualCents;
    const tax = computeNetIncome(taxableIncomeAnnualCents, taxTable, policy.medicareLevyRateBps, policy.lito);
    const hecs = applicant.hasHecsDebt
      ? computeHecsRepayment(taxableIncomeAnnualCents, attribution.lossAddBackAnnualCents, policy.hecsBands)
      : undefined;
    return {
      applicantId: applicant.id,
      assessedGrossIncomeAnnualCents,
      attributedInvestmentTaxableContributionAnnualCents: attribution.taxableContributionAnnualCents,
      attributedInvestmentLossAddBackAnnualCents: attribution.lossAddBackAnnualCents,
      taxableIncomeAnnualCents,
      tax,
      hecs,
    };
  });

  const totalAssessedNetIncomeMonthlyCents = sumCents(applicants.map((a) => a.tax.netIncomeMonthlyCents));
  const totalHecsRepaymentMonthlyCents = sumCents(applicants.map((a) => a.hecs?.repaymentMonthlyCents ?? 0));

  const expenses = assessExpenses(input.expenses, household, income.householdGrossAnnualCents, benchmarkTable);
  const liabilities = assessLiabilities(input.liabilities, household, policy);
  const totalLiabilitiesIncludingHecsMonthlyCents = liabilities.totalAssessedMonthlyCents + totalHecsRepaymentMonthlyCents;

  const proposedLoan = assessProposedLoan(input.proposedLoan, policy);

  const nms = computeNms(
    totalAssessedNetIncomeMonthlyCents,
    expenses.assessedExpensesMonthlyCents,
    totalLiabilitiesIncludingHecsMonthlyCents,
    proposedLoan.assessedMonthlyRepaymentCents,
  );

  const dti = computeDti(
    liabilities.liabilities,
    household,
    input.proposedLoan.amountCents,
    income.householdGrossAnnualCents,
    policy,
  );

  const lvr = computeLvr(input.proposedLoan.amountCents, input.proposedLoan.propertyValueCents, policy);

  const capacityMonthlyCents = clampCents(
    totalAssessedNetIncomeMonthlyCents - expenses.assessedExpensesMonthlyCents - totalLiabilitiesIncludingHecsMonthlyCents,
  );
  const maxBorrowing = solveMaxBorrowing(capacityMonthlyCents, proposedLoan.assessmentRateBps, input.proposedLoan.termMonths);

  return {
    policyId: policy.id,
    policyLabel: policy.label,
    assessmentDate,
    income,
    negativeGearing,
    applicants,
    totalAssessedNetIncomeMonthlyCents,
    totalHecsRepaymentMonthlyCents,
    expenses,
    liabilities,
    totalLiabilitiesIncludingHecsMonthlyCents,
    proposedLoan,
    nms,
    dti,
    lvr,
    maxBorrowing,
  };
}
