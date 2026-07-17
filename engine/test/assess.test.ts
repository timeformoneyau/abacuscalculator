import { describe, expect, it } from "vitest";
import { runAssessment } from "../src/assess.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import type { AssessmentInput } from "../src/types.js";

const policy = createV1PolicySnapshot();

describe("runAssessment edge cases", () => {
  it("handles an applicant with no income lines at all (e.g. a non-earning co-applicant)", () => {
    const input: AssessmentInput = {
      household: {
        applicants: [
          { id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
          { id: "a2", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
        ],
        dependants: 0,
        location: "National",
      },
      incomes: [{ id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 9_000_000, frequency: "annual" }],
      expenses: [{ id: "e1", category: "basic", amountCents: 200_000, frequency: "monthly" }],
      liabilities: [],
      investmentProperties: [],
      proposedLoan: {
        amountCents: 30_000_000,
        termMonths: 360,
        repaymentType: "principalAndInterest",
        productRateBps: 600,
        propertyValueCents: 40_000_000,
      },
      assessmentDate: "2026-08-01",
    };
    const result = runAssessment(input, policy);
    const a2 = result.applicants.find((a) => a.applicantId === "a2")!;
    expect(a2.assessedGrossIncomeAnnualCents).toBe(0);
    expect(a2.taxableIncomeAnnualCents).toBe(0);
  });

  it("does not attribute an investment property's result to a co-applicant who holds no ownership share in it", () => {
    const input: AssessmentInput = {
      household: {
        applicants: [
          { id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
          { id: "a2", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
        ],
        dependants: 0,
        location: "National",
      },
      incomes: [
        { id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 9_000_000, frequency: "annual" },
        { id: "i2", applicantId: "a2", type: "baseSalary", amountCents: 7_000_000, frequency: "annual" },
      ],
      expenses: [{ id: "e1", category: "basic", amountCents: 300_000, frequency: "monthly" }],
      liabilities: [],
      investmentProperties: [
        {
          id: "p1",
          ownership: [{ applicantId: "a1", sharePct: 100 }], // a2 holds no share
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
        amountCents: 30_000_000,
        termMonths: 360,
        repaymentType: "principalAndInterest",
        productRateBps: 600,
        propertyValueCents: 40_000_000,
      },
      assessmentDate: "2026-08-01",
    };
    const result = runAssessment(input, policy);
    const a1 = result.applicants.find((a) => a.applicantId === "a1")!;
    const a2 = result.applicants.find((a) => a.applicantId === "a2")!;
    expect(a1.attributedInvestmentTaxableContributionAnnualCents).toBe(-380_000);
    expect(a2.attributedInvestmentTaxableContributionAnnualCents).toBe(0);
    // 6,999,996 not 7,000,000: annual->monthly->annual rounding (CLAUDE.md "all engine math monthly").
    expect(a2.taxableIncomeAnnualCents).toBe(6_999_996);
  });
});
