import { describe, expect, it } from "vitest";
import { assessExpenses, lookupBenchmark } from "../src/expenses.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import { selectBenchmarkTable } from "../src/policy/select.js";
import type { ExpenseLine, Household } from "../src/types.js";

const policy = createV1PolicySnapshot();
const table = selectBenchmarkTable(policy, "2026-08-01");

const single: Household = {
  applicants: [{ id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 }],
  dependants: 0,
  location: "National",
};

const coupleWithDependants: Household = {
  applicants: [
    { id: "a1", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
    { id: "a2", essentialServicesOccupation: false, hasHecsDebt: false, hecsBalanceCents: 0 },
  ],
  dependants: 2,
  location: "National",
};

describe("lookupBenchmark", () => {
  it("hand-verified: single, no dependants, <=$80k band -> $2,150/mo", () => {
    const result = lookupBenchmark(single, 7_000_000, table);
    expect(result.benchmarkMonthlyCents).toBe(215_000);
    expect(result.householdRow).toBe("single");
  });

  it("hand-verified: couple + 2 dependants, $130-190k band -> $3,950 + 2x$950 = $5,850/mo", () => {
    const result = lookupBenchmark(coupleWithDependants, 15_000_000, table);
    expect(result.baseMonthlyCents).toBe(395_000);
    expect(result.dependantLoadingMonthlyCents).toBe(190_000);
    expect(result.benchmarkMonthlyCents).toBe(585_000);
    expect(result.householdRow).toBe("couple");
  });

  it("uses the top open-ended band above $190k", () => {
    const result = lookupBenchmark(single, 25_000_000, table);
    expect(result.benchmarkMonthlyCents).toBe(310_000);
  });

  it("falls back to the last band for an out-of-range (negative) income rather than erroring", () => {
    const result = lookupBenchmark(single, -100, table);
    expect(result.benchmarkMonthlyCents).toBe(310_000);
  });
});

describe("assessExpenses", () => {
  it("uses the benchmark when it exceeds declared Basic, plus Non-Basic on top (DL-003)", () => {
    const expenses: ExpenseLine[] = [
      { id: "e1", category: "basic", amountCents: 150_000, frequency: "monthly" }, // below $2,150 benchmark
      { id: "e2", category: "nonBasic", amountCents: 50_000, frequency: "monthly" },
    ];
    const result = assessExpenses(expenses, single, 7_000_000, table);
    expect(result.basicComparisonWinner).toBe("benchmark");
    expect(result.assessedBasicMonthlyCents).toBe(215_000);
    expect(result.assessedExpensesMonthlyCents).toBe(265_000);
  });

  it("uses declared Basic when it exceeds the benchmark", () => {
    const expenses: ExpenseLine[] = [
      { id: "e1", category: "basic", amountCents: 300_000, frequency: "monthly" },
      { id: "e2", category: "nonBasic", amountCents: 20_000, frequency: "monthly" },
    ];
    const result = assessExpenses(expenses, single, 7_000_000, table);
    expect(result.basicComparisonWinner).toBe("declared");
    expect(result.assessedBasicMonthlyCents).toBe(300_000);
    expect(result.assessedExpensesMonthlyCents).toBe(320_000);
  });
});
