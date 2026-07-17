import { describe, expect, it } from "vitest";
import { runAssessment } from "../../src/assess.js";
import { createV1PolicySnapshot } from "../../src/policy/snapshot.js";
import type { AssessmentInput } from "../../src/types.js";

/**
 * Scenario: single applicant with a HECS/HELP debt and two credit cards.
 * Exercises the HECS marginal-band liability line (treated as a liability,
 * not a tax line, per policy §3.3) alongside credit cards assessed on
 * limit, not balance. Hand-verified independently.
 */
const policy = createV1PolicySnapshot();

const input: AssessmentInput = {
  household: {
    applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: true, hecsBalanceCents: 3_000_000 }],
    dependants: 0,
    location: "National",
  },
  incomes: [{ id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 10_000_000, frequency: "annual" }],
  expenses: [
    { id: "e1", category: "basic", amountCents: 220_000, frequency: "monthly" },
    { id: "e2", category: "nonBasic", amountCents: 40_000, frequency: "monthly" },
  ],
  liabilities: [
    { kind: "creditCard", id: "c1", limitCents: 800_000, ownership: [{ applicantId: "a1", sharePct: 100 }] },
    { kind: "creditCard", id: "c2", limitCents: 300_000, ownership: [{ applicantId: "a1", sharePct: 100 }] },
  ],
  investmentProperties: [],
  proposedLoan: {
    amountCents: 30_000_000,
    termMonths: 360,
    repaymentType: "principalAndInterest",
    productRateBps: 620,
    propertyValueCents: 50_000_000,
  },
  assessmentDate: "2026-08-01",
};

describe("scenario: applicant with HECS and credit cards", () => {
  const result = runAssessment(input, policy);
  const applicant = result.applicants[0]!;

  it("computes the HECS marginal repayment as a liability line, not a tax line", () => {
    expect(applicant.hecs).toBeDefined();
    expect(applicant.hecs!.repaymentAnnualCents).toBe(457_079); // 15% over $69,528 threshold
    expect(result.totalHecsRepaymentMonthlyCents).toBe(38_090);
    // HECS does not reduce taxable income or net income — it is purely a liability line.
    // (9,999,996 not 10,000,000: annual->monthly->annual rounding, per CLAUDE.md "all engine math monthly".)
    expect(applicant.tax.taxableIncomeAnnualCents).toBe(9_999_996);
  });

  it("assesses both credit cards at 3.8% of their own limit", () => {
    expect(result.liabilities.liabilities[0]!.fullAssessedMonthlyCents).toBe(30_400);
    expect(result.liabilities.liabilities[1]!.fullAssessedMonthlyCents).toBe(11_400);
  });

  it("includes HECS liability in total liabilities used for NMS", () => {
    expect(result.totalLiabilitiesIncludingHecsMonthlyCents).toBe(79_890);
  });

  it("passes with a positive net monthly surplus", () => {
    expect(result.nms.netMonthlySurplusCents).toBe(35_060);
    expect(result.nms.pass).toBe(true);
  });

  it("includes the HECS balance in total debt for DTI", () => {
    expect(result.dti.totalDebtCents).toBe(800_000 + 300_000 + 3_000_000 + 30_000_000);
  });
});
