import { describe, expect, it } from "vitest";
import { computeDti, computeLvr, computeNms } from "../src/metrics.js";
import { assessLiabilities } from "../src/liabilities.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import type { Household, Liability } from "../src/types.js";

const policy = createV1PolicySnapshot();
const household: Household = {
  applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: true, hecsBalanceCents: 2_000_000 }],
  dependants: 0,
  location: "National",
};

describe("computeNms", () => {
  it("computes surplus as income minus expenses minus liabilities minus proposed repayment", () => {
    const result = computeNms(1_000_000, 300_000, 200_000, 400_000);
    expect(result.netMonthlySurplusCents).toBe(100_000);
    expect(result.pass).toBe(true);
  });

  it("fails when surplus is negative", () => {
    const result = computeNms(500_000, 300_000, 200_000, 400_000);
    expect(result.netMonthlySurplusCents).toBe(-400_000);
    expect(result.pass).toBe(false);
  });

  it("passes at exactly zero surplus", () => {
    const result = computeNms(900_000, 300_000, 200_000, 400_000);
    expect(result.netMonthlySurplusCents).toBe(0);
    expect(result.pass).toBe(true);
  });
});

describe("computeDti", () => {
  it("flags DTI >= 6.0 without failing (DL-009)", () => {
    const liabilities: Liability[] = [
      {
        kind: "existingMortgage",
        id: "m1",
        balanceCents: 400_000_000, // $4,000,000 existing debt
        interestRateBps: 600,
        remainingTermMonths: 360,
        repaymentType: "principalAndInterest",
        ownership: [{ applicantId: "a1", sharePct: 100 }],
      },
    ];
    const assessed = assessLiabilities(liabilities, household, policy);
    // total debt = 400,000,000 mortgage + 2,000,000 HECS + 100,000,000 proposed = 502,000,000
    // gross annual income = 50,000,000 ($500,000) -> DTI = 10.04
    const result = computeDti(assessed.liabilities, household, 100_000_000, 50_000_000, policy);
    expect(result.dti).toBeCloseTo(10.04, 5);
    expect(result.highDtiFlag).toBe(true);
  });

  it("does not flag below the threshold", () => {
    const result = computeDti([], household, 30_000_000, 50_000_000, policy);
    // (30,000,000 + 2,000,000 HECS) / 50,000,000 = 0.64
    expect(result.highDtiFlag).toBe(false);
  });

  it("treats zero gross annual income as DTI 0 rather than dividing by zero", () => {
    const result = computeDti([], household, 30_000_000, 0, policy);
    expect(result.dti).toBe(0);
    expect(result.highDtiFlag).toBe(false);
  });
});

describe("computeLvr", () => {
  it("flags high LVR above 80%", () => {
    const result = computeLvr(85_000_000, 100_000_000, policy);
    expect(result.lvr).toBeCloseTo(0.85);
    expect(result.highLvrFlag).toBe(true);
    expect(result.prominentWarning).toBe(false);
  });

  it("gives a prominent warning above 90%", () => {
    const result = computeLvr(95_000_000, 100_000_000, policy);
    expect(result.prominentWarning).toBe(true);
  });

  it("does not flag at or below 80%", () => {
    const result = computeLvr(80_000_000, 100_000_000, policy);
    expect(result.highLvrFlag).toBe(false);
  });

  it("treats zero property value as LVR 0 rather than dividing by zero", () => {
    const result = computeLvr(80_000_000, 0, policy);
    expect(result.lvr).toBe(0);
    expect(result.highLvrFlag).toBe(false);
  });
});
