import { describe, expect, it } from "vitest";
import { runAssessment } from "../../src/assess.js";
import { createV1PolicySnapshot } from "../../src/policy/snapshot.js";
import type { AssessmentInput } from "../../src/types.js";

/**
 * Scenario: couple with two dependants and rental income (as a plain
 * income line, not a tracked InvestmentProperty — no negative-gearing
 * detail needed for this case). Exercises multi-applicant income
 * aggregation, dependant loadings on the expense benchmark, and per-
 * applicant tax. Hand-verified independently.
 */
const policy = createV1PolicySnapshot();

const input: AssessmentInput = {
  household: {
    applicants: [
      { id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
      { id: "a2", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
    ],
    dependants: 2,
    location: "National",
  },
  incomes: [
    { id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 9_500_000, frequency: "annual" },
    { id: "i2", applicantId: "a2", type: "baseSalary", amountCents: 6_000_000, frequency: "annual" },
    { id: "i3", applicantId: "a1", type: "rentalIncome", amountCents: 200_000, frequency: "monthly" },
  ],
  expenses: [
    { id: "e1", category: "basic", amountCents: 380_000, frequency: "monthly" },
    { id: "e2", category: "nonBasic", amountCents: 70_000, frequency: "monthly" },
  ],
  liabilities: [],
  investmentProperties: [],
  proposedLoan: {
    amountCents: 60_000_000,
    termMonths: 360,
    repaymentType: "principalAndInterest",
    productRateBps: 600,
    propertyValueCents: 70_000_000,
  },
  assessmentDate: "2026-08-01",
};

describe("scenario: couple with dependants and rental income", () => {
  const result = runAssessment(input, policy);

  it("aggregates income across both applicants, shading rental at 80%", () => {
    const a1 = result.applicants.find((a) => a.applicantId === "a1")!;
    expect(a1.taxableIncomeAnnualCents).toBe(11_420_004);
    const a2 = result.applicants.find((a) => a.applicantId === "a2")!;
    expect(a2.taxableIncomeAnnualCents).toBe(6_000_000);
    expect(result.totalAssessedNetIncomeMonthlyCents).toBe(1_145_967);
  });

  it("applies the couple row plus two dependant loadings on the benchmark", () => {
    expect(result.expenses.benchmark.householdRow).toBe("couple");
    expect(result.expenses.benchmark.dependants).toBe(2);
    expect(result.expenses.benchmark.benchmarkMonthlyCents).toBe(585_000); // $3,950 + 2x$950
    expect(result.expenses.assessedExpensesMonthlyCents).toBe(655_000);
  });

  it("passes with a positive net monthly surplus", () => {
    expect(result.nms.netMonthlySurplusCents).toBe(8_193);
    expect(result.nms.pass).toBe(true);
  });

  it("flags high LVR above 80% but not the 90% prominent warning", () => {
    expect(result.lvr.lvr).toBeCloseTo(60_000_000 / 70_000_000);
    expect(result.lvr.highLvrFlag).toBe(true);
    expect(result.lvr.prominentWarning).toBe(false);
  });

  it("does not flag DTI", () => {
    expect(result.dti.dti).toBeCloseTo(3.352, 3);
    expect(result.dti.highDtiFlag).toBe(false);
  });
});
