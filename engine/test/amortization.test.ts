import { describe, expect, it } from "vitest";
import {
  computeMonthlyPrincipalAndInterest,
  residualPrincipalAndInterestTermMonths,
  resolveAssessmentRateBps,
} from "../src/amortization.js";

describe("computeMonthlyPrincipalAndInterest", () => {
  it("handles the 0% edge case as a straight-line split", () => {
    expect(computeMonthlyPrincipalAndInterest(120_000, 0, 12)).toBe(10_000);
  });

  it("matches the standard reducing-balance annuity formula: $100,000 @ 12% p.a. over 12 months", () => {
    expect(computeMonthlyPrincipalAndInterest(10_000_000, 1200, 12)).toBe(888_488);
  });

  it("matches a 30-year mortgage case: $500,000 @ 9% p.a. over 360 months", () => {
    expect(computeMonthlyPrincipalAndInterest(50_000_000, 900, 360)).toBe(402_311);
  });

  it("rejects a non-positive term", () => {
    expect(() => computeMonthlyPrincipalAndInterest(100_000, 500, 0)).toThrow();
  });
});

describe("resolveAssessmentRateBps", () => {
  it("uses rate + buffer when it exceeds the floor", () => {
    expect(resolveAssessmentRateBps(600, 300, 525)).toBe(900); // 6% + 3% = 9% > 5.25% floor
  });

  it("uses the floor when rate + buffer is below it", () => {
    expect(resolveAssessmentRateBps(100, 300, 525)).toBe(525); // 1% + 3% = 4% < 5.25% floor
  });
});

describe("residualPrincipalAndInterestTermMonths", () => {
  it("subtracts the IO period from the total term (policy §2 example: 5yr IO on 30yr -> 25yr P&I)", () => {
    expect(residualPrincipalAndInterestTermMonths(360, 60)).toBe(300);
  });

  it("returns the full term when there is no IO period", () => {
    expect(residualPrincipalAndInterestTermMonths(360, undefined)).toBe(360);
  });

  it("rejects an IO period that consumes the whole term", () => {
    expect(() => residualPrincipalAndInterestTermMonths(360, 360)).toThrow();
  });
});
