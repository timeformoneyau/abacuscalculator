import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeBoth, DEFAULT_ASSUMPTIONS } from "../calc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(__dirname, "../calc_data.json"), "utf8"));

function baseInputs(overrides) {
  return {
    loanType: "Owner Occupied",
    structure: "Single",
    dependants: 0,
    primaryIncome: 100000,
    primaryOther: 0,
    secondaryIncome: 0,
    secondaryOther: 0,
    creditCardLimit: 0,
    otherMonthlyCommitments: 0,
    declaredMonthlyExpenses: 0,
    loanTermMonths: 360,
    ...overrides,
  };
}

function pct(a, b) {
  return (((a - b) / b) * 100).toFixed(3) + "%";
}

let failures = 0;

function check(label, actual, expected, tolerancePct) {
  const diffPct = Math.abs((actual - expected) / expected) * 100;
  const ok = diffPct <= tolerancePct;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: actual=${actual.toFixed(2)} expected~${expected} (diff ${diffPct.toFixed(3)}%)`);
  if (!ok) failures++;
}

// --- Validation check 1 ---
// Single, Owner Occupied, 0 deps, primaryIncome 100000, all else 0:
// Bendigo max ~ $541,756 ; ColCap max ~ $547,859 ; variance ~ +1.1% (+$6,103)
{
  const inputs = baseInputs({});
  const result = computeBoth(inputs, DEFAULT_ASSUMPTIONS, data);
  console.log("\n--- Check 1 ---");
  check("bendigoMax", result.bendigoMax, 541756, 0.5);
  check("colcapMax", result.colcapMax, 547859, 0.5);
  check("varianceDollar", result.varianceDollar, 6103, 2);
  console.log(`variancePct: ${(result.variancePct * 100).toFixed(2)}% (expected ~+1.1%)`);
}

// --- Validation check 2 ---
// Single, OO, 0 deps, primaryIncome 100000, primaryOther 25000, creditCardLimit 30000:
// ColCap materially higher than Bendigo (~+13%).
{
  const inputs = baseInputs({ primaryOther: 25000, creditCardLimit: 30000 });
  const result = computeBoth(inputs, DEFAULT_ASSUMPTIONS, data);
  console.log("\n--- Check 2 ---");
  console.log(`bendigoMax=${result.bendigoMax.toFixed(2)} colcapMax=${result.colcapMax.toFixed(2)} variancePct=${(result.variancePct * 100).toFixed(2)}% (expected ~+13%)`);
  const diffPct = Math.abs(result.variancePct * 100 - 13);
  const ok = diffPct <= 2;
  console.log(ok ? "PASS variancePct within tolerance" : "FAIL variancePct out of tolerance");
  if (!ok) failures++;
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
