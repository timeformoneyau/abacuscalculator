// Pure calculation engine for the Borrowing Power Calculator (Bendigo vs ColCap).
// No I/O, no framework imports. All money in plain dollars (not cents) — this
// is an estimate/analysis tool, not a settlement-grade ledger.
//
// Tax brackets and HEM tables are the real production data (calc_data.json:
// tax_brackets_FY2627, medicare_FY2526, hem_bendigo, hem_colcap) — not the
// illustrative placeholder numbers from the design mockup.

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
//           rateInvestor (%), buffer (%) }
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
  const maxBorrowing = surplus > 0 ? Math.round((surplus * factor) / 1000) * 1000 : 0;

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

// assumptions: { rateOO, rateINV, benCC, colCC, benShade, colShade, buffer } — all as
// plain percentage numbers (e.g. rateOO: 6.19 means 6.19% p.a.), matching the assumption
// panel's editable fields.
// data: { tax_brackets_FY2627, medicare_FY2526, hem_bendigo, hem_colcap }
export function computeBoth(inputs, assumptions, data) {
  const bendigoFunder = {
    otherIncomeShade: assumptions.benShade / 100,
    creditCardRate: assumptions.benCC / 100,
    rateOwnerOccupied: assumptions.rateOO,
    rateInvestor: assumptions.rateINV,
    buffer: assumptions.buffer,
  };
  const colcapFunder = {
    otherIncomeShade: assumptions.colShade / 100,
    creditCardRate: assumptions.colCC / 100,
    rateOwnerOccupied: assumptions.rateOO,
    rateInvestor: assumptions.rateINV,
    buffer: assumptions.buffer,
  };

  const bendigo = runFunderCalc(inputs, bendigoFunder, data.hem_bendigo, data.tax_brackets_FY2627, data.medicare_FY2526);
  const colcap = runFunderCalc(inputs, colcapFunder, data.hem_colcap, data.tax_brackets_FY2627, data.medicare_FY2526);

  const bendigoMax = bendigo.maxBorrowing;
  const colcapMax = colcap.maxBorrowing;
  const varianceDollar = colcapMax - bendigoMax;
  const variancePct = bendigoMax === 0 ? 0 : varianceDollar / bendigoMax;
  const direction =
    varianceDollar === 0
      ? "Both funders estimate the same maximum borrowing."
      : `ColCap estimates $${Math.abs(varianceDollar).toLocaleString("en-AU")} ${varianceDollar > 0 ? "higher" : "lower"} than Bendigo for this scenario.`;

  return { bendigo, colcap, bendigoMax, colcapMax, varianceDollar, variancePct, direction };
}

export const DEFAULT_ASSUMPTIONS = {
  rateOO: 6.19,
  rateINV: 6.54,
  benCC: 3.8,
  colCC: 3.0,
  benShade: 80,
  colShade: 90,
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
