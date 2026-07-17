import { describe, expect, it } from "vitest";
import { assessLiabilities } from "../src/liabilities.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import type { Household, Liability } from "../src/types.js";

const policy = createV1PolicySnapshot();

const household: Household = {
  applicants: [
    { id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
    { id: "a2", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
  ],
  dependants: 0,
  location: "National",
};

describe("assessLiabilities", () => {
  it("assesses an existing P&I mortgage at higher of (rate+buffer) vs floor", () => {
    const liabilities: Liability[] = [
      {
        kind: "existingMortgage",
        id: "m1",
        balanceCents: 50_000_000,
        interestRateBps: 600,
        remainingTermMonths: 360,
        repaymentType: "principalAndInterest",
        ownership: [{ applicantId: "a1", sharePct: 100 }],
      },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.liabilities[0]!.assessmentRateBps).toBe(900);
    expect(result.liabilities[0]!.fullAssessedMonthlyCents).toBe(402_311);
    expect(result.liabilities[0]!.householdAssessedMonthlyCents).toBe(402_311);
  });

  it("assesses an interest-only mortgage as P&I over the residual P&I term", () => {
    const liabilities: Liability[] = [
      {
        kind: "existingMortgage",
        id: "m2",
        balanceCents: 30_000_000,
        interestRateBps: 600,
        remainingTermMonths: 360,
        repaymentType: "interestOnly",
        ioRemainingMonths: 60,
        ownership: [{ applicantId: "a1", sharePct: 100 }],
      },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.liabilities[0]!.termMonths).toBe(300);
    expect(result.liabilities[0]!.fullAssessedMonthlyCents).toBe(251_759);
  });

  it("assesses credit cards at 3.8% of limit regardless of balance", () => {
    const liabilities: Liability[] = [
      { kind: "creditCard", id: "c1", limitCents: 1_000_000, ownership: [{ applicantId: "a1", sharePct: 100 }] },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.liabilities[0]!.fullAssessedMonthlyCents).toBe(38_000);
  });

  it("assesses other loans at the actual contractual repayment", () => {
    const liabilities: Liability[] = [
      {
        kind: "otherLoan",
        id: "l1",
        balanceCents: 1_000_000,
        repaymentAmountCents: 50_000,
        frequency: "monthly",
        ownership: [{ applicantId: "a1", sharePct: 100 }],
      },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.liabilities[0]!.fullAssessedMonthlyCents).toBe(50_000);
  });

  it("assesses BNPL at the actual declared commitment, frequency-converted", () => {
    const liabilities: Liability[] = [
      {
        kind: "bnpl",
        id: "b1",
        balanceCents: 200_000,
        declaredCommitmentCents: 20_000,
        frequency: "fortnightly",
        ownership: [{ applicantId: "a1", sharePct: 100 }],
      },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.liabilities[0]!.fullAssessedMonthlyCents).toBe(43_333);
  });

  it("counts a liability shared between co-applicants once in full at household level (DL-004)", () => {
    const liabilities: Liability[] = [
      {
        kind: "creditCard",
        id: "c2",
        limitCents: 1_000_000,
        ownership: [
          { applicantId: "a1", sharePct: 50 },
          { applicantId: "a2", sharePct: 50 },
        ],
      },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.liabilities[0]!.householdAssessedMonthlyCents).toBe(38_000);
    expect(result.liabilities[0]!.applicantShares).toEqual([
      { applicantId: "a1", sharePct: 50, assessedMonthlyCents: 19_000 },
      { applicantId: "a2", sharePct: 50, assessedMonthlyCents: 19_000 },
    ]);
  });

  it("apportions a liability shared with a party outside the assessment to only the in-household share", () => {
    const liabilities: Liability[] = [
      {
        kind: "creditCard",
        id: "c3",
        limitCents: 1_000_000,
        ownership: [
          { applicantId: "a1", sharePct: 40 },
          { applicantId: "external-party", sharePct: 60 },
        ],
      },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.liabilities[0]!.inHouseholdSharePct).toBe(40);
    expect(result.liabilities[0]!.householdAssessedMonthlyCents).toBe(15_200); // 40% of 38,000
  });

  it("throws when ownership shares don't sum to 100%", () => {
    const liabilities: Liability[] = [
      { kind: "creditCard", id: "c4", limitCents: 1_000_000, ownership: [{ applicantId: "a1", sharePct: 60 }] },
    ];
    expect(() => assessLiabilities(liabilities, household, policy)).toThrow();
  });

  it("sums multiple liabilities into a household total", () => {
    const liabilities: Liability[] = [
      { kind: "creditCard", id: "c5", limitCents: 1_000_000, ownership: [{ applicantId: "a1", sharePct: 100 }] },
      {
        kind: "otherLoan",
        id: "l2",
        balanceCents: 500_000,
        repaymentAmountCents: 25_000,
        frequency: "monthly",
        ownership: [{ applicantId: "a1", sharePct: 100 }],
      },
    ];
    const result = assessLiabilities(liabilities, household, policy);
    expect(result.totalAssessedMonthlyCents).toBe(63_000);
  });
});
