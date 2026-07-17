import { describe, expect, it } from "vitest";
import { solveMaxBorrowing } from "../src/maxBorrowing.js";
import { computeMonthlyPrincipalAndInterest } from "../src/amortization.js";

describe("solveMaxBorrowing", () => {
  it("inverts the P&I formula: solving for the capacity that produced a known repayment recovers the loan amount", () => {
    const rateBps = 900;
    const termMonths = 360;
    const knownLoanCents = 50_000_000;
    const repayment = computeMonthlyPrincipalAndInterest(knownLoanCents, rateBps, termMonths);
    const result = solveMaxBorrowing(repayment, rateBps, termMonths);
    // Recovers the original loan amount to within a few cents of rounding drift.
    expect(Math.abs(result.maxLoanAmountCents - knownLoanCents)).toBeLessThan(100);
  });

  it("re-solving at the recovered amount reproduces (approximately) NMS = 0", () => {
    const rateBps = 900;
    const termMonths = 360;
    const capacity = 402_311;
    const result = solveMaxBorrowing(capacity, rateBps, termMonths);
    const repaymentAtSolvedAmount = computeMonthlyPrincipalAndInterest(result.maxLoanAmountCents, rateBps, termMonths);
    expect(Math.abs(repaymentAtSolvedAmount - capacity)).toBeLessThan(2);
  });

  it("handles the 0% rate edge case as a straight-line split", () => {
    const result = solveMaxBorrowing(10_000, 0, 100);
    expect(result.maxLoanAmountCents).toBe(1_000_000);
  });

  it("returns zero borrowing capacity when there is no surplus", () => {
    const result = solveMaxBorrowing(0, 900, 360);
    expect(result.maxLoanAmountCents).toBe(0);
  });

  it("clamps negative capacity to zero", () => {
    const result = solveMaxBorrowing(-50_000, 900, 360);
    expect(result.maxLoanAmountCents).toBe(0);
    expect(result.assumptions.capacityMonthlyCents).toBe(0);
  });

  it("records the assumptions used (policy §7.4 requires these displayed alongside the result)", () => {
    const result = solveMaxBorrowing(400_000, 900, 360);
    expect(result.assumptions).toEqual({
      assessmentRateBps: 900,
      termMonths: 360,
      repaymentType: "principalAndInterest",
      capacityMonthlyCents: 400_000,
    });
  });
});
