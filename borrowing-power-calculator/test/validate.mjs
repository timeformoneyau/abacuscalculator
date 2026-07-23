import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeBoth } from "../calc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(__dirname, "../calc_data.json"), "utf8"));

function baseInputs(overrides) {
  return {
    loanType: "OO",
    structure: "Single",
    dependants: 0,
    primaryIncome: 100000,
    primaryOther: 0,
    secondaryIncome: 0,
    secondaryOther: 0,
    ccLimit: 0,
    otherMonthly: 0,
    livingExpenses: 0,
    term: 30,
    ...overrides,
  };
}

// Original BUILD_SPEC assumptions (no buffer, 9.03% flat rate, ColCap shade 100%) — kept as
// a regression check on the underlying tax/HEM/PV math, independent of the newer design's
// buffer + updated default assumption values.
const NO_BUFFER_ASSUMPTIONS = {
  rateOO: 9.03,
  rateINV: 9.03,
  benCC: 3.8,
  colCC: 3.0,
  benShade: 80,
  colShade: 100,
  buffer: 0,
};

let failures = 0;

function check(label, actual, expected, tolerancePct) {
  const diffPct = Math.abs((actual - expected) / expected) * 100;
  const ok = diffPct <= tolerancePct;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: actual=${actual.toFixed(2)} expected~${expected} (diff ${diffPct.toFixed(3)}%)`);
  if (!ok) failures++;
}

// Single, Owner Occupied, 0 deps, primaryIncome 100000, all else 0, no buffer:
// Bendigo max ~ $541,756 ; ColCap max ~ $547,859 ; variance ~ +1.1% (+$6,103)
// (allowing a wider tolerance here since maxBorrowing is now rounded to the nearest $1,000)
{
  const inputs = baseInputs({ term: 30 });
  // loanTermMonths in the original spec defaulted to 360 = 30 years, matches term:30 here.
  const result = computeBoth(inputs, NO_BUFFER_ASSUMPTIONS, data);
  console.log("\n--- Regression check (no buffer, matches original BUILD_SPEC math) ---");
  check("bendigoMax", result.bendigoMax, 541756, 0.5);
  check("colcapMax", result.colcapMax, 547859, 0.5);
  check("varianceDollar", result.varianceDollar, 6103, 20);
  console.log(`variancePct: ${(result.variancePct * 100).toFixed(2)}% (expected ~+1.1%)`);
}

// Smoke test for the shipped default scenario (design defaults, real tax/HEM data, +3% buffer)
{
  const { DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS } = await import("../calc.js");
  const result = computeBoth(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, data);
  console.log("\n--- Default scenario (buffer applied) ---");
  console.log(`bendigoMax=${result.bendigoMax} colcapMax=${result.colcapMax} varianceDollar=${result.varianceDollar} variancePct=${(result.variancePct * 100).toFixed(2)}%`);
  const sane = Number.isFinite(result.bendigoMax) && Number.isFinite(result.colcapMax) && result.bendigoMax > 0 && result.colcapMax > 0;
  console.log(sane ? "PASS both funders produce a positive finite max borrowing" : "FAIL non-finite or non-positive result");
  if (!sane) failures++;
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
