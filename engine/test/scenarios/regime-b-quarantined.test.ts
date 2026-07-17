import { describe, expect, it } from "vitest";
import { runAssessment } from "../../src/assess.js";
import { createV1PolicySnapshot } from "../../src/policy/snapshot.js";
import type { AssessmentInput } from "../../src/types.js";

/**
 * Mandatory scenario (requirements §8.5): Regime B loss fully quarantined.
 * A post-Budget established property's loss has no household residential
 * rental income to offset against, so it gets no serviceability value —
 * taxable income is unaffected. The mortgage's cash repayment still hits
 * NMS in full regardless. Hand-verified independently.
 */
const policy = createV1PolicySnapshot();

const input: AssessmentInput = {
  household: {
    applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 }],
    dependants: 0,
    location: "National",
  },
  incomes: [{ id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 9_000_000, frequency: "annual" }],
  expenses: [
    { id: "e1", category: "basic", amountCents: 200_000, frequency: "monthly" },
    { id: "e2", category: "nonBasic", amountCents: 20_000, frequency: "monthly" },
  ],
  liabilities: [
    {
      kind: "existingMortgage",
      id: "m1",
      balanceCents: 45_000_000,
      interestRateBps: 600,
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
      grossRentalIncomeCents: 150_000,
      rentalFrequency: "monthly",
      deductiblePropertyCostsAnnualCents: 200_000,
      loanBalanceCents: 45_000_000,
      actualInterestRateBps: 600,
      acquisitionDateTime: "2026-06-01T00:00:00+10:00",
      isNewBuild: false,
    },
  ],
  proposedLoan: {
    amountCents: 30_000_000,
    termMonths: 360,
    repaymentType: "principalAndInterest",
    productRateBps: 600,
    propertyValueCents: 40_000_000,
  },
  assessmentDate: "2026-08-01",
};

describe("scenario: Regime B loss fully quarantined", () => {
  const result = runAssessment(input, policy);
  const applicant = result.applicants[0]!;

  it("routes the post-Budget established property to Regime B", () => {
    expect(result.negativeGearing.properties[0]!.regime).toBe("B");
    expect(result.negativeGearing.properties[0]!.netRentalResultAnnualCents).toBe(-1_460_000);
  });

  it("gives the loss no serviceability value — taxable income equals gross salary", () => {
    expect(result.negativeGearing.properties[0]!.taxableContributionAnnualCents).toBe(0);
    expect(result.negativeGearing.properties[0]!.quarantinedLossAnnualCents).toBe(-1_460_000);
    expect(applicant.taxableIncomeAnnualCents).toBe(9_000_000);
    expect(applicant.tax.netIncomeMonthlyCents).toBe(589_000);
  });

  it("still counts the property's buffered mortgage repayment in full against NMS despite quarantining", () => {
    expect(result.liabilities.liabilities[0]!.householdAssessedMonthlyCents).toBe(362_080);
  });

  it("computes the household headline metrics", () => {
    expect(result.nms.netMonthlySurplusCents).toBe(-279_467);
    expect(result.nms.pass).toBe(false);
  });
});
