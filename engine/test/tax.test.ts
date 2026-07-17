import { describe, expect, it } from "vitest";
import { computeIncomeTax, computeLito, computeMedicareLevy, computeNetIncome } from "../src/tax.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import { selectTaxTable } from "../src/policy/select.js";

const policy = createV1PolicySnapshot();
const fy2627 = selectTaxTable(policy, "2026-08-01");
const fy2728 = selectTaxTable(policy, "2027-08-01");

describe("selectTaxTable", () => {
  it("picks FY2026-27 table for dates in that year", () => {
    expect(fy2627.id).toBe("tax-fy2026-27");
  });

  it("picks the pre-loaded FY2027-28 table (14% second bracket) once effective", () => {
    expect(fy2728.id).toBe("tax-fy2027-28");
    expect(fy2728.brackets[1]!.rateBps).toBe(1400);
  });
});

describe("computeIncomeTax", () => {
  it("hand-verified: $80,000 taxable income -> $14,520 gross tax (FY2026-27)", () => {
    const brackets = computeIncomeTax(8_000_000, fy2627);
    const total = brackets.reduce((sum, b) => sum + b.taxInBracketCents, 0);
    expect(total).toBe(1_452_000);
  });

  it("zero tax below the tax-free threshold", () => {
    const brackets = computeIncomeTax(1_500_000, fy2627);
    expect(brackets.reduce((sum, b) => sum + b.taxInBracketCents, 0)).toBe(0);
  });
});

describe("computeLito", () => {
  it("gives the full $700 offset at or below $37,500", () => {
    expect(computeLito(3_750_000, policy.lito)).toBe(70_000);
    expect(computeLito(2_000_000, policy.lito)).toBe(70_000);
  });

  it("hand-verified: $325 offset at exactly $45,000 (first taper only)", () => {
    expect(computeLito(4_500_000, policy.lito)).toBe(32_500);
  });

  it("hand-verified: $575 offset at $40,000 (first taper only, mid-range)", () => {
    expect(computeLito(4_000_000, policy.lito)).toBe(57_500);
  });

  it("is nil at $80,000 (both tapers exhaust it)", () => {
    expect(computeLito(8_000_000, policy.lito)).toBe(0);
  });

  it("returns 0 when disabled", () => {
    expect(computeLito(2_000_000, { ...policy.lito, enabled: false })).toBe(0);
  });
});

describe("computeMedicareLevy", () => {
  it("is 2% of taxable income", () => {
    expect(computeMedicareLevy(8_000_000, policy.medicareLevyRateBps)).toBe(160_000);
  });
});

describe("computeNetIncome", () => {
  it("hand-verified: $40,000 taxable income nets to $36,505.00 annual", () => {
    const result = computeNetIncome(4_000_000, fy2627, policy.medicareLevyRateBps, policy.lito);
    expect(result.grossIncomeTaxAnnualCents).toBe(327_000);
    expect(result.litoAppliedCents).toBe(57_500);
    expect(result.incomeTaxAfterLitoAnnualCents).toBe(269_500);
    expect(result.medicareLevyAnnualCents).toBe(80_000);
    expect(result.netTaxAnnualCents).toBe(349_500);
    expect(result.netIncomeAnnualCents).toBe(3_650_500);
    expect(result.netIncomeMonthlyCents).toBe(304_208);
  });

  it("hand-verified: $80,000 taxable income", () => {
    const result = computeNetIncome(8_000_000, fy2627, policy.medicareLevyRateBps, policy.lito);
    expect(result.grossIncomeTaxAnnualCents).toBe(1_452_000);
    expect(result.litoAppliedCents).toBe(0);
    expect(result.netTaxAnnualCents).toBe(1_612_000);
    expect(result.netIncomeAnnualCents).toBe(6_388_000);
  });

  it("never lets LITO exceed the tax payable (non-refundable)", () => {
    const result = computeNetIncome(1_900_000, fy2627, policy.medicareLevyRateBps, policy.lito);
    expect(result.incomeTaxAfterLitoAnnualCents).toBe(0);
    expect(result.litoAppliedCents).toBeLessThanOrEqual(result.grossIncomeTaxAnnualCents);
  });
});
