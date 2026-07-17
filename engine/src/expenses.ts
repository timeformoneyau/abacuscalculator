import { sumCents, type Cents } from "./money.js";
import { toMonthly } from "./frequency.js";
import type { ExpenseLine, Household } from "./types.js";
import type { BenchmarkTable } from "./policy/types.js";

export interface BenchmarkLookup {
  tableId: string;
  location: string;
  householdRow: "single" | "couple";
  bandLabel: string;
  dependants: number;
  baseMonthlyCents: Cents;
  dependantLoadingMonthlyCents: Cents;
  benchmarkMonthlyCents: Cents;
}

export interface ExpenseAssessment {
  declaredBasicMonthlyCents: Cents;
  declaredNonBasicMonthlyCents: Cents;
  benchmark: BenchmarkLookup;
  basicComparisonWinner: "declared" | "benchmark";
  assessedBasicMonthlyCents: Cents;
  assessedExpensesMonthlyCents: Cents;
}

/** Household type for the benchmark table: 2+ applicants = couple row; sole-parent uses the single row (policy §4). */
function householdRow(household: Household): "single" | "couple" {
  return household.applicants.length >= 2 ? "couple" : "single";
}

export function lookupBenchmark(
  household: Household,
  grossAnnualHouseholdIncomeCents: Cents,
  table: BenchmarkTable,
): BenchmarkLookup {
  const bandIndex = table.bands.findIndex(
    (b) => grossAnnualHouseholdIncomeCents >= b.minAnnualCents && (b.maxAnnualCents === null || grossAnnualHouseholdIncomeCents <= b.maxAnnualCents),
  );
  const resolvedIndex = bandIndex === -1 ? table.bands.length - 1 : bandIndex;
  const band = table.bands[resolvedIndex]!;
  const row = householdRow(household);
  const baseMonthlyCents =
    row === "couple" ? table.coupleNoDependantsMonthlyCents[resolvedIndex]! : table.singleNoDependantsMonthlyCents[resolvedIndex]!;
  const dependantLoadingMonthlyCents = table.perDependantChildMonthlyCents[resolvedIndex]! * household.dependants;
  return {
    tableId: table.id,
    location: table.location,
    householdRow: row,
    bandLabel: band.label,
    dependants: household.dependants,
    baseMonthlyCents,
    dependantLoadingMonthlyCents,
    benchmarkMonthlyCents: baseMonthlyCents + dependantLoadingMonthlyCents,
  };
}

/**
 * Assessed expenses = max(Basic declared, benchmark) + Non-Basic declared
 * (policy §4, DL-003). Both compared figures and the winner are recorded.
 */
export function assessExpenses(
  expenses: readonly ExpenseLine[],
  household: Household,
  grossAnnualHouseholdIncomeCents: Cents,
  benchmarkTable: BenchmarkTable,
): ExpenseAssessment {
  const declaredBasicMonthlyCents = sumCents(
    expenses.filter((e) => e.category === "basic").map((e) => toMonthly(e.amountCents, e.frequency)),
  );
  const declaredNonBasicMonthlyCents = sumCents(
    expenses.filter((e) => e.category === "nonBasic").map((e) => toMonthly(e.amountCents, e.frequency)),
  );
  const benchmark = lookupBenchmark(household, grossAnnualHouseholdIncomeCents, benchmarkTable);
  const basicComparisonWinner: "declared" | "benchmark" =
    declaredBasicMonthlyCents >= benchmark.benchmarkMonthlyCents ? "declared" : "benchmark";
  const assessedBasicMonthlyCents = Math.max(declaredBasicMonthlyCents, benchmark.benchmarkMonthlyCents);
  return {
    declaredBasicMonthlyCents,
    declaredNonBasicMonthlyCents,
    benchmark,
    basicComparisonWinner,
    assessedBasicMonthlyCents,
    assessedExpensesMonthlyCents: assessedBasicMonthlyCents + declaredNonBasicMonthlyCents,
  };
}
