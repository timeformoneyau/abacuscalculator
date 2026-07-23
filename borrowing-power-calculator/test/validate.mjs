import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeBoth, resolveFunderCHemTable } from "../calc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(__dirname, "../calc_data.json"), "utf8"));

const SINGLE_HEM = { mode: "single", region: "Australia" };

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

// Original BUILD_SPEC assumptions (no buffer, 9.03% flat rate both funders, Funder C shade
// 100%) — kept as a regression check on the underlying tax/HEM/PV math, independent of the
// newer design's buffer + updated default assumption values.
const NO_BUFFER_ASSUMPTIONS = {
  fbRateOO: 9.03,
  fbRateINV: 9.03,
  fcRateOO: 9.03,
  fcRateINV: 9.03,
  fbCC: 3.8,
  fcCC: 3.0,
  fbShade: 80,
  fcShade: 100,
  buffer: 0,
};

let failures = 0;

function check(label, actual, expected, tolerancePct) {
  const diffPct = Math.abs((actual - expected) / expected) * 100;
  const ok = diffPct <= tolerancePct;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: actual=${actual.toFixed(2)} expected~${expected} (diff ${diffPct.toFixed(3)}%)`);
  if (!ok) failures++;
}

// Single, Owner Occupied, 0 deps, primaryIncome 100000, all else 0, no buffer, Single HEM
// (Funder C on the national "Australia" table): Funder B max ~ $541,756 ; Funder C max ~
// $547,859 ; variance ~ +1.1% (+$6,103) (wider tolerance since maxBorrowing rounds to $1,000)
{
  const inputs = baseInputs({ term: 30 });
  const result = computeBoth(inputs, NO_BUFFER_ASSUMPTIONS, data, SINGLE_HEM);
  console.log("\n--- Regression check (no buffer, matches original BUILD_SPEC math) ---");
  check("funderBMax", result.funderBMax, 541756, 0.5);
  check("funderCMax", result.funderCMax, 547859, 0.5);
  check("varianceDollar", result.varianceDollar, 6103, 20);
  console.log(`variancePct: ${(result.variancePct * 100).toFixed(2)}% (expected ~+1.1%)`);
}

// Smoke test for the shipped default scenario (design defaults, real tax/HEM data, +3% buffer)
{
  const { DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS } = await import("../calc.js");
  const result = computeBoth(DEFAULT_INPUTS, DEFAULT_ASSUMPTIONS, data, SINGLE_HEM);
  console.log("\n--- Default scenario (buffer applied) ---");
  console.log(`funderBMax=${result.funderBMax} funderCMax=${result.funderCMax} varianceDollar=${result.varianceDollar} variancePct=${(result.variancePct * 100).toFixed(2)}%`);
  const sane = Number.isFinite(result.funderBMax) && Number.isFinite(result.funderCMax) && result.funderBMax > 0 && result.funderCMax > 0;
  console.log(sane ? "PASS both funders produce a positive finite max borrowing" : "FAIL non-finite or non-positive result");
  if (!sane) failures++;
}

// Sanity check that per-funder rates are genuinely independent (Funder C rate materially
// higher than Funder B rate should reduce Funder C's max borrowing relative to Funder B's,
// all else equal).
{
  const inputs = baseInputs({ term: 30, primaryIncome: 120000 });
  const assumptions = { ...NO_BUFFER_ASSUMPTIONS, fbRateOO: 6.0, fcRateOO: 9.0 };
  const result = computeBoth(inputs, assumptions, data, SINGLE_HEM);
  console.log("\n--- Independent per-funder rates check (Funder B 6.0% vs Funder C 9.0%) ---");
  console.log(`funderBMax=${result.funderBMax} funderCMax=${result.funderCMax}`);
  const ok = result.funderBMax > result.funderCMax;
  console.log(ok ? "PASS lower-rate funder (B) has higher max borrowing" : "FAIL rates are not being applied independently");
  if (!ok) failures++;
}

// HEM Figures modes: Standardize should zero out any HEM-driven variance (Funder C literally
// uses Funder B's table); Regional should pick the selected state table; Single should match
// the national "Australia" table.
{
  const inputs = baseInputs({ term: 30, structure: "Couple", dependants: 2, primaryIncome: 145000, livingExpenses: 500 });
  const assumptions = { fbRateOO: 6.19, fbRateINV: 6.19, fcRateOO: 6.19, fcRateINV: 6.19, fbCC: 3.8, fcCC: 3.8, fbShade: 100, fcShade: 100, buffer: 3.0 };

  const standardized = computeBoth(inputs, assumptions, data, { mode: "standardize", region: "Australia" });
  console.log("\n--- HEM Figures: Standardize (should have zero HEM-driven variance) ---");
  console.log(`funderB HEM monthly=${standardized.funderB.hemMonthly.toFixed(2)} funderC HEM monthly=${standardized.funderC.hemMonthly.toFixed(2)}`);
  const hemMatches = Math.abs(standardized.funderB.hemMonthly - standardized.funderC.hemMonthly) < 0.01;
  console.log(hemMatches ? "PASS Funder C's HEM equals Funder B's HEM when standardized" : "FAIL HEM tables did not match under standardize mode");
  if (!hemMatches) failures++;

  const sydney = computeBoth(inputs, assumptions, data, { mode: "regional", region: "Sydney" });
  const single = computeBoth(inputs, assumptions, data, SINGLE_HEM);
  console.log("\n--- HEM Figures: Regional (Sydney) vs Single (Australia) ---");
  console.log(`Sydney funderC HEM=${sydney.funderC.hemMonthly.toFixed(2)} Australia funderC HEM=${single.funderC.hemMonthly.toFixed(2)}`);
  const regionDiffers = Math.abs(sydney.funderC.hemMonthly - single.funderC.hemMonthly) > 0.01;
  console.log(regionDiffers ? "PASS Sydney HEM differs from the national Australia table" : "FAIL regional selection had no effect");
  if (!regionDiffers) failures++;

  const table = resolveFunderCHemTable("regional", "Melbourne", data);
  const hasMelbourne = Array.isArray(table.rows.couple) && table.rows.couple.length === 14;
  console.log(hasMelbourne ? "PASS resolveFunderCHemTable resolves named regions" : "FAIL could not resolve Melbourne region table");
  if (!hasMelbourne) failures++;
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
