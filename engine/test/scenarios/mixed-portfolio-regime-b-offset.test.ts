import { describe, expect, it } from "vitest";
import { runAssessment } from "../../src/assess.js";
import { createV1PolicySnapshot } from "../../src/policy/snapshot.js";
import type { AssessmentInput } from "../../src/types.js";

/**
 * Mandatory scenario (requirements §8.5): mixed portfolio where a Regime B
 * loss partially offsets another property's rental income. A Regime A
 * gain of $10,000/yr caps how much of a $14,600/yr Regime B loss is
 * deductible — the remainder is quarantined. Hand-verified independently.
 */
const policy = createV1PolicySnapshot();

const input: AssessmentInput = {
  household: {
    applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 }],
    dependants: 0,
    location: "National",
  },
  incomes: [{ id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 8_500_000, frequency: "annual" }],
  expenses: [
    { id: "e1", category: "basic", amountCents: 230_000, frequency: "monthly" },
    { id: "e2", category: "nonBasic", amountCents: 25_000, frequency: "monthly" },
  ],
  liabilities: [
    {
      kind: "existingMortgage",
      id: "m1",
      balanceCents: 24_000_000,
      interestRateBps: 500,
      remainingTermMonths: 360,
      repaymentType: "principalAndInterest",
      ownership: [{ applicantId: "a1", sharePct: 100 }],
      linkedInvestmentPropertyId: "gain",
    },
    {
      kind: "existingMortgage",
      id: "m2",
      balanceCents: 45_000_000,
      interestRateBps: 600,
      remainingTermMonths: 360,
      repaymentType: "principalAndInterest",
      ownership: [{ applicantId: "a1", sharePct: 100 }],
      linkedInvestmentPropertyId: "loss",
    },
  ],
  investmentProperties: [
    {
      id: "gain",
      ownership: [{ applicantId: "a1", sharePct: 100 }],
      grossRentalIncomeCents: 250_000,
      rentalFrequency: "monthly",
      deductiblePropertyCostsAnnualCents: 200_000,
      loanBalanceCents: 24_000_000,
      actualInterestRateBps: 500,
      acquisitionDateTime: "2020-01-01T00:00:00+10:00", // Regime A
      isNewBuild: false,
    },
    {
      id: "loss",
      ownership: [{ applicantId: "a1", sharePct: 100 }],
      grossRentalIncomeCents: 150_000,
      rentalFrequency: "monthly",
      deductiblePropertyCostsAnnualCents: 200_000,
      loanBalanceCents: 45_000_000,
      actualInterestRateBps: 600,
      acquisitionDateTime: "2026-06-01T00:00:00+10:00", // Regime B
      isNewBuild: false,
    },
  ],
  proposedLoan: {
    amountCents: 35_000_000,
    termMonths: 360,
    repaymentType: "principalAndInterest",
    productRateBps: 650,
    propertyValueCents: 50_000_000,
  },
  assessmentDate: "2026-08-01",
};

describe("scenario: mixed portfolio — Regime B loss partially offset", () => {
  const result = runAssessment(input, policy);
  const applicant = result.applicants[0]!;

  it("routes each property to the correct regime", () => {
    const gain = result.negativeGearing.properties.find((p) => p.propertyId === "gain")!;
    const loss = result.negativeGearing.properties.find((p) => p.propertyId === "loss")!;
    expect(gain.regime).toBe("A");
    expect(gain.netRentalResultAnnualCents).toBe(1_000_000);
    expect(loss.regime).toBe("B");
    expect(loss.netRentalResultAnnualCents).toBe(-1_460_000);
  });

  it("caps the deductible Regime B loss at the Regime A gain, quarantining the excess", () => {
    expect(result.negativeGearing.deductibleRegimeBLossAnnualCents).toBe(-1_000_000);
    expect(result.negativeGearing.quarantinedRegimeBLossAnnualCents).toBe(-460_000);
    expect(result.negativeGearing.taxableIncomeContributionAnnualCents).toBe(0);
  });

  it("nets the gain and offsettable loss to zero in taxable income", () => {
    expect(applicant.attributedInvestmentTaxableContributionAnnualCents).toBe(0);
    // 8,499,996 not 8,500,000: annual->monthly->annual rounding (CLAUDE.md "all engine math monthly").
    expect(applicant.taxableIncomeAnnualCents).toBe(8_499_996); // salary only, properties net to $0
  });

  it("still assesses both mortgages' buffered cash repayments in full", () => {
    const m1 = result.liabilities.liabilities.find((l) => l.liability.id === "m1")!;
    const m2 = result.liabilities.liabilities.find((l) => l.liability.id === "m2")!;
    expect(m1.householdAssessedMonthlyCents).toBe(176_103);
    expect(m2.householdAssessedMonthlyCents).toBe(362_080);
  });

  it("computes the household headline metrics", () => {
    expect(result.nms.netMonthlySurplusCents).toBe(-541_816);
    expect(result.nms.pass).toBe(false);
    expect(result.dti.dti).toBeCloseTo(12.235, 3);
    expect(result.dti.highDtiFlag).toBe(true);
  });
});
