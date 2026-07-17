import { describe, expect, it } from "vitest";
import { runAssessment } from "../../src/assess.js";
import { createV1PolicySnapshot } from "../../src/policy/snapshot.js";
import type { AssessmentInput } from "../../src/types.js";

/**
 * Mandatory scenario (requirements §8.5): Regime A negatively geared
 * property. A grandfathered investment property with a net rental loss
 * flows fully into taxable income, reducing tax — while its buffered
 * mortgage repayment still counts in full against NMS as an ordinary
 * liability (the "cash line"). Hand-verified independently.
 */
const policy = createV1PolicySnapshot();

const input: AssessmentInput = {
  household: {
    applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 }],
    dependants: 0,
    location: "National",
  },
  incomes: [{ id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 12_000_000, frequency: "annual" }],
  expenses: [
    { id: "e1", category: "basic", amountCents: 250_000, frequency: "monthly" },
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
      acquisitionDateTime: "2020-01-01T00:00:00+10:00",
      isNewBuild: false,
    },
  ],
  proposedLoan: {
    amountCents: 40_000_000,
    termMonths: 360,
    repaymentType: "principalAndInterest",
    productRateBps: 600,
    propertyValueCents: 55_000_000,
  },
  assessmentDate: "2026-08-01",
};

describe("scenario: Regime A negatively geared property", () => {
  const result = runAssessment(input, policy);
  const applicant = result.applicants[0]!;

  it("routes the grandfathered property to Regime A", () => {
    expect(result.negativeGearing.properties[0]!.regime).toBe("A");
    expect(result.negativeGearing.properties[0]!.netRentalResultAnnualCents).toBe(-380_000);
  });

  it("flows the full loss into taxable income, reducing tax below the no-property case", () => {
    expect(applicant.attributedInvestmentTaxableContributionAnnualCents).toBe(-380_000);
    expect(applicant.taxableIncomeAnnualCents).toBe(11_620_000); // $120,000 salary less $3,800 loss
    expect(applicant.tax.netIncomeMonthlyCents).toBe(737_467);
  });

  it("still counts the property's buffered mortgage repayment in full against NMS (the cash line)", () => {
    expect(result.liabilities.liabilities[0]!.assessmentRateBps).toBe(800); // 5% + 3% buffer > floor
    expect(result.liabilities.liabilities[0]!.householdAssessedMonthlyCents).toBe(293_506);
  });

  it("computes the household headline metrics", () => {
    expect(result.nms.netMonthlySurplusCents).toBe(-157_888);
    expect(result.nms.pass).toBe(false);
    expect(result.dti.dti).toBeCloseTo(6.667, 3); // (40,000,000 existing + 40,000,000 proposed) / 12,000,000
    expect(result.dti.highDtiFlag).toBe(true); // flag, never a decline (DL-009)
  });
});
