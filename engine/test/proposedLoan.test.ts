import { describe, expect, it } from "vitest";
import { assessProposedLoan } from "../src/proposedLoan.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import type { ProposedLoan } from "../src/types.js";

const policy = createV1PolicySnapshot();

describe("assessProposedLoan", () => {
  it("assesses a P&I loan at higher of (rate+buffer) vs floor over the entered term", () => {
    const loan: ProposedLoan = {
      amountCents: 50_000_000,
      termMonths: 360,
      repaymentType: "principalAndInterest",
      productRateBps: 600,
      propertyValueCents: 60_000_000,
    };
    const result = assessProposedLoan(loan, policy);
    expect(result.assessmentRateBps).toBe(900);
    expect(result.termMonths).toBe(360);
    expect(result.assessedMonthlyRepaymentCents).toBe(402_311);
    expect(result.rule).not.toContain("residual");
  });

  it("assesses an interest-only loan as P&I over the residual P&I term", () => {
    const loan: ProposedLoan = {
      amountCents: 30_000_000,
      termMonths: 360,
      repaymentType: "interestOnly",
      ioRemainingMonths: 60,
      productRateBps: 600,
      propertyValueCents: 40_000_000,
    };
    const result = assessProposedLoan(loan, policy);
    expect(result.termMonths).toBe(300);
    expect(result.assessedMonthlyRepaymentCents).toBe(251_759);
    expect(result.rule).toContain("residual P&I term");
  });
});
