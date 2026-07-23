// Pure calculation engine for the Borrowing Power Calculator (Funder B vs Funder C).
// No I/O, no framework imports. All money in plain dollars (not cents) — this
// is an estimate/analysis tool, not a settlement-grade ledger.
//
// Tax brackets and HEM tables are the real production data (calc_data.json:
// tax_brackets_FY2627, medicare_FY2526, hem_funder_b, hem_regional) — not the
// illustrative placeholder numbers from the design mockup.
//
// Funder B always uses its own HEM table (hem_funder_b). Funder C's HEM table is
// selectable via the "HEM Figures" mode:
//   - "single"      Funder C uses the single national ("Australia") regional table.
//   - "standardize" Funder C uses Funder B's own table, to isolate HEM's contribution
//                    to the variance from every other policy difference.
//   - "regional"    Funder C uses the selected state/region table from hem_regional.
export function resolveFunderCHemTable(hemMode, hemRegion, data) {
  if (hemMode === "standardize") return data.hem_funder_b;
  const regionName = hemMode === "regional" ? hemRegion : "Australia";
  const region = data.hem_regional.regions[regionName];
  return { band_lower_bounds: data.hem_regional.band_lower_bounds, rows: region.rows };
}

export function incomeTax(taxable, brackets) {
  if (taxable <= 0) return 0;
  let bracket = brackets[0];
  for (const b of brackets) {
    if (taxable >= b.lower) bracket = b;
  }
  return bracket.tax_at_lower + bracket.rate * (taxable - bracket.lower);
}

export function medicare(taxable, medicareConfig) {
  const { lower_single: lo, upper_single: hi, rate, shade_in_rate } = medicareConfig;
  if (taxable <= lo) return 0;
  if (taxable >= hi) return taxable * rate;
  return (taxable - lo) * shade_in_rate;
}

function bandIndex(totalGrossIncome, bounds) {
  let idx = 0;
  for (let i = 0; i < bounds.length; i++) {
    if (bounds[i] <= totalGrossIncome) idx = i;
  }
  return idx;
}

export function computeHem(totalGrossIncome, dependants, structure, hemTable) {
  const col = bandIndex(totalGrossIncome, hemTable.band_lower_bounds);
  const cappedDep = Math.min(dependants, 3);
  const extraDep = Math.max(dependants - 3, 0);

  const isCouple = structure === "Couple";
  const baseRowKey = isCouple
    ? ["couple", "couple_1", "couple_2", "couple_3"][cappedDep]
    : ["single", "single_1", "single_2", "single_3"][cappedDep];
  const additionalRowKey = isCouple ? "couple_additional" : "single_additional";

  const baseRow = hemTable.rows[baseRowKey];
  const additionalRow = hemTable.rows[additionalRowKey];

  const hemWeekly = baseRow[col] + extraDep * additionalRow[col];
  const hemMonthly = (hemWeekly * 52) / 12;

  return { bandIndex: col, baseRowKey, additionalRowKey, extraDep, hemWeekly, hemMonthly };
}

export function presentValue(monthlyRate, months, pmt) {
  if (monthlyRate === 0) return pmt * months;
  return (pmt * (1 - Math.pow(1 + monthlyRate, -months))) / monthlyRate;
}

// inputs: { loanType: 'OO'|'INV', structure: 'Single'|'Couple', dependants, primaryIncome,
//           primaryOther, secondaryIncome, secondaryOther, ccLimit, otherMonthly,
//           livingExpenses, term (years) }
// funder: { otherIncomeShade (0-1), creditCardRate (0-1), rateOwnerOccupied (%),
//           rateInvestor (%), buffer (%) } — rates are this funder's own.
export function runFunderCalc(inputs, funder, hemTable, taxBrackets, medicareConfig) {
  const { loanType, structure, dependants, primaryIncome, primaryOther, secondaryIncome, secondaryOther, ccLimit, otherMonthly, livingExpenses, term } = inputs;

  const isCouple = structure === "Couple";
  const shade = funder.otherIncomeShade;

  const secondaryIncomeUsed = isCouple ? secondaryIncome : 0;
  const secondaryOtherUsed = isCouple ? secondaryOther : 0;

  const baseIncome = primaryIncome + secondaryIncomeUsed;
  const otherRaw = primaryOther + secondaryOtherUsed;
  const otherShaded = otherRaw * shade;
  const totalGrossIncome = baseIncome + otherShaded;

  const primaryTaxable = primaryIncome + primaryOther * shade;
  const secondaryTaxable = isCouple ? secondaryIncomeUsed + secondaryOtherUsed * shade : 0;

  const incomeTaxTotal = incomeTax(primaryTaxable, taxBrackets) + (isCouple ? incomeTax(secondaryTaxable, taxBrackets) : 0);
  const medicareTotal = medicare(primaryTaxable, medicareConfig) + (isCouple ? medicare(secondaryTaxable, medicareConfig) : 0);

  const netAnnual = totalGrossIncome - incomeTaxTotal - medicareTotal;
  const netMonthly = netAnnual / 12;

  const hem = computeHem(totalGrossIncome, dependants, structure, hemTable);
  const livingUsed = Math.max(hem.hemMonthly, livingExpenses);
  const hemBinds = hem.hemMonthly >= livingExpenses;

  const cc = ccLimit * funder.creditCardRate;
  const commitments = livingUsed + cc + otherMonthly;
  const surplus = netMonthly - commitments;

  const baseRate = loanType === "INV" ? funder.rateInvestor : funder.rateOwnerOccupied;
  const assessRate = baseRate + funder.buffer;
  const r = assessRate / 100 / 12;
  const n = Math.max(1, term) * 12;
  const factor = r === 0 ? n : (1 - Math.pow(1 + r, -n)) / r;
  const maxBorrowing = surplus > 0 ? Math.round(surplus * factor) : 0;

  return {
    // funder-difference drivers (highlight these in the UI)
    otherIncomeShade: shade,
    creditCardRate: funder.creditCardRate,
    hemMonthly: hem.hemMonthly,

    baseIncome,
    otherRaw,
    otherShaded,
    totalGrossIncome,
    incomeTaxTotal,
    medicareTotal,
    netAnnual,
    netMonthly,
    hemBandIndex: hem.bandIndex,
    hemBaseRowKey: hem.baseRowKey,
    hemAdditionalRowKey: hem.additionalRowKey,
    hemWeekly: hem.hemWeekly,
    livingUsed,
    hemBinds,
    cc,
    otherMonthly,
    commitments,
    surplus,
    baseRate,
    assessRate,
    maxBorrowing,
  };
}

// assumptions: { fbRateOO, fbRateINV, fcRateOO, fcRateINV, fbCC, fcCC, fbShade, fcShade,
//                buffer } — all as plain percentage numbers (e.g. fbRateOO: 6.19 means
//                6.19% p.a.), matching the assumption panel's editable fields.
// data: { tax_brackets_FY2627, medicare_FY2526, hem_funder_b, hem_regional }
// hemSelection: { mode: "single"|"standardize"|"regional", region }
export function computeBoth(inputs, assumptions, data, hemSelection) {
  const funderBConfig = {
    otherIncomeShade: assumptions.fbShade / 100,
    creditCardRate: assumptions.fbCC / 100,
    rateOwnerOccupied: assumptions.fbRateOO,
    rateInvestor: assumptions.fbRateINV,
    buffer: assumptions.buffer,
  };
  const funderCConfig = {
    otherIncomeShade: assumptions.fcShade / 100,
    creditCardRate: assumptions.fcCC / 100,
    rateOwnerOccupied: assumptions.fcRateOO,
    rateInvestor: assumptions.fcRateINV,
    buffer: assumptions.buffer,
  };
  const funderCHemTable = resolveFunderCHemTable(hemSelection.mode, hemSelection.region, data);

  const funderB = runFunderCalc(inputs, funderBConfig, data.hem_funder_b, data.tax_brackets_FY2627, data.medicare_FY2526);
  const funderC = runFunderCalc(inputs, funderCConfig, funderCHemTable, data.tax_brackets_FY2627, data.medicare_FY2526);

  const funderBMax = funderB.maxBorrowing;
  const funderCMax = funderC.maxBorrowing;
  const varianceDollar = funderCMax - funderBMax;
  const variancePct = funderBMax === 0 ? 0 : varianceDollar / funderBMax;
  const direction =
    varianceDollar === 0
      ? "Both funders estimate the same maximum borrowing."
      : `Funder C estimates $${Math.abs(varianceDollar).toLocaleString("en-AU")} ${varianceDollar > 0 ? "higher" : "lower"} than Funder B for this scenario.`;

  return { funderB, funderC, funderBMax, funderCMax, varianceDollar, variancePct, direction };
}

// Attributes the total Funder B vs Funder C variance to the individual policy levers that
// can differ between funders (other-income shading, HEM table, credit-card rate, interest
// rate). Uses a one-at-a-time swap from Funder B's baseline: for each lever, recompute max
// borrowing with only that lever replaced by Funder C's value, holding everything else at
// Funder B's settings. The resulting delta is that lever's isolated contribution. Because
// max borrowing is a nonlinear function of these inputs, the deltas won't sum exactly to
// the total variance (interaction effects) — this is a standard one-factor-at-a-time bridge,
// not an exact decomposition.
export function computeContributors(inputs, assumptions, data, hemSelection) {
  const fbConfig = {
    otherIncomeShade: assumptions.fbShade / 100,
    creditCardRate: assumptions.fbCC / 100,
    rateOwnerOccupied: assumptions.fbRateOO,
    rateInvestor: assumptions.fbRateINV,
    buffer: assumptions.buffer,
  };
  const fcConfig = {
    otherIncomeShade: assumptions.fcShade / 100,
    creditCardRate: assumptions.fcCC / 100,
    rateOwnerOccupied: assumptions.fcRateOO,
    rateInvestor: assumptions.fcRateINV,
    buffer: assumptions.buffer,
  };
  const funderCHemTable = resolveFunderCHemTable(hemSelection.mode, hemSelection.region, data);

  const baselineMax = runFunderCalc(inputs, fbConfig, data.hem_funder_b, data.tax_brackets_FY2627, data.medicare_FY2526).maxBorrowing;
  const totalMax = runFunderCalc(inputs, fcConfig, funderCHemTable, data.tax_brackets_FY2627, data.medicare_FY2526).maxBorrowing;
  const totalVariance = totalMax - baselineMax;

  const swapMax = (overrides, hemTable) => runFunderCalc(inputs, { ...fbConfig, ...overrides }, hemTable || data.hem_funder_b, data.tax_brackets_FY2627, data.medicare_FY2526).maxBorrowing;

  const levers = [
    { key: "shade", label: "Other-income shading", delta: swapMax({ otherIncomeShade: fcConfig.otherIncomeShade }) - baselineMax },
    { key: "hem", label: "HEM benchmark", delta: swapMax({}, funderCHemTable) - baselineMax },
    { key: "cc", label: "Credit card rate", delta: swapMax({ creditCardRate: fcConfig.creditCardRate }) - baselineMax },
    { key: "rate", label: "Interest rate", delta: swapMax({ rateOwnerOccupied: fcConfig.rateOwnerOccupied, rateInvestor: fcConfig.rateInvestor }) - baselineMax },
  ];

  const totalVarianceAbs = Math.abs(totalVariance);
  const contributors = levers
    .map((l) => ({
      ...l,
      pctOfGap: totalVarianceAbs === 0 ? 0 : (Math.abs(l.delta) / totalVarianceAbs) * 100,
      favors: l.delta > 0 ? "C" : l.delta < 0 ? "B" : null,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  return { totalVariance, contributors };
}

export const DEFAULT_HEM_SELECTION = { mode: "single", region: "Australia" };

export const DEFAULT_ASSUMPTIONS = {
  fbRateOO: 6.19,
  fbRateINV: 6.54,
  fcRateOO: 6.19,
  fcRateINV: 6.54,
  fbCC: 3.8,
  fcCC: 3.0,
  fbShade: 80,
  fcShade: 100,
  buffer: 3.0,
};

export const DEFAULT_INPUTS = {
  loanType: "OO",
  structure: "Couple",
  dependants: 2,
  primaryIncome: 145000,
  primaryOther: 12000,
  secondaryIncome: 88000,
  secondaryOther: 0,
  ccLimit: 15000,
  otherMonthly: 850,
  livingExpenses: 4200,
  term: 30,
};

export const CLEARED_INPUTS = {
  loanType: "OO",
  structure: "Single",
  dependants: 0,
  primaryIncome: 0,
  primaryOther: 0,
  secondaryIncome: 0,
  secondaryOther: 0,
  ccLimit: 0,
  otherMonthly: 0,
  livingExpenses: 0,
  term: 30,
};
