import { describe, expect, it } from "vitest";
import { runAssessment } from "../../src/assess.js";
import { createV1PolicySnapshot } from "../../src/policy/snapshot.js";
import type { AssessmentInput } from "../../src/types.js";

/**
 * Scenario: single PAYG applicant, no dependants, no investment properties,
 * no HECS. The simplest end-to-end case — mostly exercises income shading,
 * tax, the expense benchmark, a single credit card, and the headline
 * metrics wiring. Hand-verified independently (see PR description / commit
 * for the calculator cross-check).
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
    { id: "e2", category: "nonBasic", amountCents: 50_000, frequency: "monthly" },
  ],
  liabilities: [
    { kind: "creditCard", id: "c1", limitCents: 500_000, ownership: [{ applicantId: "a1", sharePct: 100 }] },
  ],
  investmentProperties: [],
  proposedLoan: {
    amountCents: 40_000_000,
    termMonths: 360,
    repaymentType: "principalAndInterest",
    productRateBps: 650,
    propertyValueCents: 50_000_000,
  },
  assessmentDate: "2026-08-01",
};

describe("scenario: single PAYG applicant", () => {
  const result = runAssessment(input, policy);

  it("shades base salary at 100% and computes net income via the tax engine", () => {
    expect(result.income.householdGrossAnnualCents).toBe(9_000_000);
    expect(result.totalAssessedNetIncomeMonthlyCents).toBe(589_000);
  });

  it("uses the proxy benchmark over the lower declared Basic figure", () => {
    expect(result.expenses.basicComparisonWinner).toBe("benchmark");
    expect(result.expenses.assessedExpensesMonthlyCents).toBe(295_000);
  });

  it("assesses the credit card at 3.8% of limit", () => {
    expect(result.liabilities.totalAssessedMonthlyCents).toBe(19_000);
  });

  it("assesses the proposed loan at rate + buffer over the floor, and computes NMS", () => {
    expect(result.proposedLoan.assessmentRateBps).toBe(950); // 6.5% + 3% buffer > 5.25% floor
    expect(result.proposedLoan.assessedMonthlyRepaymentCents).toBe(336_342);
    expect(result.nms.netMonthlySurplusCents).toBe(-61_342);
    expect(result.nms.pass).toBe(false);
  });

  it("does not flag LVR at exactly 80%", () => {
    expect(result.lvr.lvr).toBeCloseTo(0.8);
    expect(result.lvr.highLvrFlag).toBe(false);
  });

  it("computes DTI and max borrowing capacity", () => {
    expect(result.dti.dti).toBeCloseTo(4.5, 5);
    expect(result.dti.highDtiFlag).toBe(false);
    expect(result.maxBorrowing.assumptions.capacityMonthlyCents).toBe(275_000);
    expect(result.maxBorrowing.maxLoanAmountCents).toBe(32_704_837);
  });
});
