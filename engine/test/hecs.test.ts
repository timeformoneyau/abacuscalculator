import { describe, expect, it } from "vitest";
import { computeHecsRepayment } from "../src/hecs.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";

const bands = createV1PolicySnapshot().hecsBands;

describe("computeHecsRepayment", () => {
  it("is nil at exactly the $69,528 threshold", () => {
    const result = computeHecsRepayment(6_952_800, 0, bands);
    expect(result.repaymentAnnualCents).toBe(0);
  });

  it("is nil below the threshold", () => {
    expect(computeHecsRepayment(3_000_000, 0, bands).repaymentAnnualCents).toBe(0);
  });

  it("hand-verified: 15c/$1 over $69,528 just above the threshold", () => {
    const result = computeHecsRepayment(6_952_900, 0, bands);
    expect(result.repaymentAnnualCents).toBe(15);
  });

  it("hand-verified: $100,000 repayment income -> $4,570.80", () => {
    const result = computeHecsRepayment(10_000_000, 0, bands);
    expect(result.repaymentAnnualCents).toBe(457_080);
  });

  it("hand-verified: $150,000 repayment income -> $12,476.46 (base + 17% band)", () => {
    const result = computeHecsRepayment(15_000_000, 0, bands);
    expect(result.repaymentAnnualCents).toBe(1_247_646);
  });

  it("hand-verified: $200,000 repayment income -> flat 10% of total = $20,000", () => {
    const result = computeHecsRepayment(20_000_000, 0, bands);
    expect(result.repaymentAnnualCents).toBe(2_000_000);
  });

  it("adds back net investment losses to repayment income (domain trap: negative gearing does not reduce HECS)", () => {
    const withoutLoss = computeHecsRepayment(10_000_000, 0, bands);
    const withLossAddedBack = computeHecsRepayment(9_000_000, 1_000_000, bands);
    expect(withLossAddedBack.repaymentIncomeAnnualCents).toBe(10_000_000);
    expect(withLossAddedBack.repaymentAnnualCents).toBe(withoutLoss.repaymentAnnualCents);
  });

  it("computes a monthly commitment as annual / 12", () => {
    const result = computeHecsRepayment(10_000_000, 0, bands);
    expect(result.repaymentMonthlyCents).toBe(Math.round(457_080 / 12));
  });

  it("throws if the band table doesn't cover the repayment income (misconfigured settings)", () => {
    expect(() => computeHecsRepayment(10_000_000, 0, [])).toThrow();
  });
});
