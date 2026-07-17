import { describe, expect, it } from "vitest";
import { runAssessment } from "../../src/assess.js";
import { createV1PolicySnapshot } from "../../src/policy/snapshot.js";
import type { AssessmentInput } from "../../src/types.js";

/**
 * Mandatory scenario (requirements §8.5): HECS add-back interaction with a
 * Regime A loss. CLAUDE.md domain trap — a Regime A negative gearing loss
 * lowers tax but must NOT lower the assessed HECS commitment: repayment
 * income adds the loss back, landing exactly on the pre-loss gross salary.
 * Hand-verified independently.
 */
const policy = createV1PolicySnapshot();

const input: AssessmentInput = {
  household: {
    applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: true, hecsBalanceCents: 2_500_000 }],
    dependants: 0,
    location: "National",
  },
  incomes: [{ id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 9_500_000, frequency: "annual" }],
  expenses: [
    { id: "e1", category: "basic", amountCents: 240_000, frequency: "monthly" },
    { id: "e2", category: "nonBasic", amountCents: 30_000, frequency: "monthly" },
  ],
  liabilities: [
    {
      kind: "existingMortgage",
      id: "m1",
      balanceCents: 40_000_000,
      interestRateBps: 500,
      remainingTermMonths: 360,
      repaymentType: "principalAndInterest",
      ownership: [{ applicantId: "a1", sharePct: 100 }],
      linkedInvestmentPropertyId: "p1",
    },
  ],
  investmentProperties: [
    {
      id: "p1",
      ownership: [{ applicantId: "a1", sharePct: 100 }],
      grossRentalIncomeCents: 200_000,
      rentalFrequency: "monthly",
      deductiblePropertyCostsAnnualCents: 300_000,
      loanBalanceCents: 40_000_000,
      actualInterestRateBps: 500,
      acquisitionDateTime: "2020-01-01T00:00:00+10:00", // Regime A
      isNewBuild: false,
    },
  ],
  proposedLoan: {
    amountCents: 25_000_000,
    termMonths: 360,
    repaymentType: "principalAndInterest",
    productRateBps: 600,
    propertyValueCents: 40_000_000,
  },
  assessmentDate: "2026-08-01",
};

describe("scenario: HECS add-back with a Regime A loss", () => {
  const result = runAssessment(input, policy);
  const applicant = result.applicants[0]!;

  it("reduces taxable income by the Regime A loss", () => {
    expect(applicant.attributedInvestmentTaxableContributionAnnualCents).toBe(-380_000);
    // 9,120,004 not 9,120,000: assessedGrossIncomeAnnualCents is monthly x12 (CLAUDE.md "all engine math monthly").
    expect(applicant.taxableIncomeAnnualCents).toBe(9_120_004); // ~$95,000 salary less $3,800 loss
  });

  it("adds the loss back for HECS, landing exactly on assessed gross salary — the loss lowers tax but not HECS", () => {
    expect(applicant.attributedInvestmentLossAddBackAnnualCents).toBe(380_000);
    expect(applicant.hecs!.repaymentIncomeAnnualCents).toBe(applicant.assessedGrossIncomeAnnualCents);
    expect(applicant.hecs!.repaymentIncomeAnnualCents).toBe(9_500_004);
  });

  it("hand-verified: HECS repayment of $3,820.81/yr, materially more than if computed on taxable income alone", () => {
    expect(applicant.hecs!.repaymentAnnualCents).toBe(382_081);
    expect(applicant.hecs!.repaymentMonthlyCents).toBe(31_840);
    // The naive (wrong) figure a HECS calc on taxable income alone would give — confirms the add-back matters.
    expect(applicant.hecs!.repaymentAnnualCents).toBeGreaterThan(325_081);
  });

  it("computes the household headline metrics", () => {
    expect(result.totalHecsRepaymentMonthlyCents).toBe(31_840);
    expect(result.nms.netMonthlySurplusCents).toBe(-205_702);
    expect(result.nms.pass).toBe(false);
  });
});
