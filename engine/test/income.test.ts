import { describe, expect, it } from "vitest";
import { assessIncome } from "../src/income.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import type { Household, IncomeLine } from "../src/types.js";

const policy = createV1PolicySnapshot();

function household(overrides: Partial<Household["applicants"][number]> = {}): Household {
  return {
    applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0, ...overrides }],
    dependants: 0,
    location: "National",
  };
}

describe("assessIncome", () => {
  it("shades base salary at 100%", () => {
    const incomes: IncomeLine[] = [{ id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 1_000_000, frequency: "annual" }];
    const result = assessIncome(incomes, household(), policy);
    expect(result.lines[0]!.assessedMonthlyCents).toBe(83_333); // 1,000,000/12 = 83333.33 -> 83333
  });

  it("shades overtime at 80% by default", () => {
    const incomes: IncomeLine[] = [{ id: "i1", applicantId: "a1", type: "overtime", amountCents: 100_000, frequency: "monthly" }];
    const result = assessIncome(incomes, household(), policy);
    expect(result.lines[0]!.assessedMonthlyCents).toBe(80_000);
  });

  it("shades overtime at 100% for essential-services occupations", () => {
    const incomes: IncomeLine[] = [{ id: "i1", applicantId: "a1", type: "overtime", amountCents: 100_000, frequency: "monthly" }];
    const result = assessIncome(incomes, household({ essentialServicesOccupation: true }), policy);
    expect(result.lines[0]!.assessedMonthlyCents).toBe(100_000);
    expect(result.lines[0]!.shadingRule).toContain("essential-services override");
  });

  it("shades rental income at 80%", () => {
    const incomes: IncomeLine[] = [{ id: "i1", applicantId: "a1", type: "rentalIncome", amountCents: 200_000, frequency: "monthly" }];
    const result = assessIncome(incomes, household(), policy);
    expect(result.lines[0]!.assessedMonthlyCents).toBe(160_000);
  });

  it("shades self-employed and government benefits at 100%", () => {
    const incomes: IncomeLine[] = [
      { id: "i1", applicantId: "a1", type: "selfEmployed", amountCents: 100_000, frequency: "monthly" },
      { id: "i2", applicantId: "a1", type: "governmentBenefits", amountCents: 50_000, frequency: "monthly" },
    ];
    const result = assessIncome(incomes, household(), policy);
    expect(result.lines[0]!.assessedMonthlyCents).toBe(100_000);
    expect(result.lines[1]!.assessedMonthlyCents).toBe(50_000);
  });

  it("aggregates per-applicant and household totals", () => {
    const h: Household = {
      applicants: [
        { id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
        { id: "a2", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
      ],
      dependants: 0,
      location: "National",
    };
    const incomes: IncomeLine[] = [
      { id: "i1", applicantId: "a1", type: "baseSalary", amountCents: 100_000, frequency: "monthly" },
      { id: "i2", applicantId: "a2", type: "baseSalary", amountCents: 50_000, frequency: "monthly" },
    ];
    const result = assessIncome(incomes, h, policy);
    expect(result.perApplicant.find((a) => a.applicantId === "a1")!.assessedMonthlyCents).toBe(100_000);
    expect(result.perApplicant.find((a) => a.applicantId === "a2")!.assessedMonthlyCents).toBe(50_000);
    expect(result.householdAssessedMonthlyCents).toBe(150_000);
    expect(result.householdGrossAnnualCents).toBe(1_800_000);
  });
});
