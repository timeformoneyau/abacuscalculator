import type { BenchmarkTable, PolicySnapshot, TaxTableVersion } from "./types.js";

/**
 * Picks the version effective at assessmentDate: the latest whose
 * effectiveFrom <= assessmentDate. Never falls back to "today" — the
 * assessment date is always an explicit input (CLAUDE.md).
 */
function selectEffective<T extends { effectiveFrom: string }>(
  versions: readonly T[],
  assessmentDate: string,
): T {
  const applicable = versions
    .filter((v) => v.effectiveFrom <= assessmentDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  const selected = applicable[0];
  if (!selected) {
    throw new Error(`No table version effective on or before ${assessmentDate}`);
  }
  return selected;
}

export function selectTaxTable(policy: PolicySnapshot, assessmentDate: string): TaxTableVersion {
  return selectEffective(policy.taxTables, assessmentDate);
}

export function selectBenchmarkTable(policy: PolicySnapshot, assessmentDate: string): BenchmarkTable {
  return selectEffective(policy.benchmarkTables, assessmentDate);
}
