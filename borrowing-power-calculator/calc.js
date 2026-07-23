// Pure calculation engine for the Borrowing Power Calculator (Bendigo vs ColCap).
// Implements BUILD_SPEC.md exactly. No I/O, no framework imports. All money in
// plain dollars (not cents) to match the spec's Excel-derived arithmetic; this
// is an estimate/analysis tool, not a settlement-grade ledger.

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

// Runs the calculation once for a single funder's constants.
// inputs: shared customer scenario. funder: { otherIncomeShade, creditCardRate, rate }.
// hemTable/taxBrackets/medicareConfig: that funder's data tables.
export function runFunderCalc(inputs, funder, hemTable, taxBrackets, medicareConfig) {
  const {
    loanType,
    structure,
    dependants,
    primaryIncome,
    primaryOther,
    secondaryIncome,
    secondaryOther,
    creditCardLimit,
    otherMonthlyCommitments,
    declaredMonthlyExpenses,
    loanTermMonths,
  } = inputs;

  const isCouple = structure === "Couple";
  const shade = funder.otherIncomeShade;

  // Income
  const primaryOtherCounted = primaryOther * shade;
  const secondaryIncomeUsed = isCouple ? secondaryIncome : 0;
  const secondaryOtherCounted = isCouple ? secondaryOther * shade : 0;
  const totalGrossIncome = primaryIncome + primaryOtherCounted + secondaryIncomeUsed + secondaryOtherCounted;

  // Tax
  const primaryTaxable = primaryIncome + primaryOtherCounted;
  const primaryIncomeTax = incomeTax(primaryTaxable, taxBrackets);
  const primaryMedicare = medicare(primaryTaxable, medicareConfig);
  const primaryTax = primaryIncomeTax + primaryMedicare;

  const secondaryTaxable = isCouple ? secondaryIncomeUsed + secondaryOtherCounted : 0;
  const secondaryIncomeTax = isCouple ? incomeTax(secondaryTaxable, taxBrackets) : 0;
  const secondaryMedicare = isCouple ? medicare(secondaryTaxable, medicareConfig) : 0;
  const secondaryTax = secondaryIncomeTax + secondaryMedicare;

  const totalTax = primaryTax + secondaryTax;

  // Net income
  const netAnnual = totalGrossIncome - totalTax;
  const netMonthly = netAnnual / 12;

  // HEM
  const hem = computeHem(totalGrossIncome, dependants, structure, hemTable);

  // Expenses
  const expensesUsed = Math.max(hem.hemMonthly, declaredMonthlyExpenses);
  const creditCardMonthly = creditCardLimit * funder.creditCardRate;
  const totalMonthlyExpenses = expensesUsed + creditCardMonthly + otherMonthlyCommitments;

  // Net available & max borrowing
  const netAvailableMonthly = netMonthly - totalMonthlyExpenses;
  const rate = loanType === "Investor" ? funder.rateInvestor : funder.rateOwnerOccupied;
  const maxBorrowing =
    netAvailableMonthly <= 0 ? 0 : presentValue(rate / 12, loanTermMonths, netAvailableMonthly);

  return {
    // funder-difference drivers (highlight these three in the UI)
    otherIncomeShade: shade,
    creditCardRate: funder.creditCardRate,
    hemMonthly: hem.hemMonthly,

    // full breakdown, for drill-down
    primaryOtherCounted,
    secondaryIncomeUsed,
    secondaryOtherCounted,
    totalGrossIncome,
    primaryTaxable,
    primaryIncomeTax,
    primaryMedicare,
    primaryTax,
    secondaryTaxable,
    secondaryIncomeTax,
    secondaryMedicare,
    secondaryTax,
    totalTax,
    netAnnual,
    netMonthly,
    hemBandIndex: hem.bandIndex,
    hemBaseRowKey: hem.baseRowKey,
    hemAdditionalRowKey: hem.additionalRowKey,
    hemExtraDep: hem.extraDep,
    hemWeekly: hem.hemWeekly,
    expensesUsed,
    creditCardMonthly,
    otherMonthlyCommitments,
    totalMonthlyExpenses,
    netAvailableMonthly,
    rate,
    loanTermMonths,
    maxBorrowing,
  };
}

// assumptions: { rateOwnerOccupied, rateInvestor, bendigo: {otherIncomeShade, creditCardRate},
//                colcap: {otherIncomeShade, creditCardRate} }
// data: { tax_brackets_FY2627, medicare_FY2526, hem_bendigo, hem_colcap }
export function computeBoth(inputs, assumptions, data) {
  const bendigoFunder = {
    otherIncomeShade: assumptions.bendigo.otherIncomeShade,
    creditCardRate: assumptions.bendigo.creditCardRate,
    rateOwnerOccupied: assumptions.rateOwnerOccupied,
    rateInvestor: assumptions.rateInvestor,
  };
  const colcapFunder = {
    otherIncomeShade: assumptions.colcap.otherIncomeShade,
    creditCardRate: assumptions.colcap.creditCardRate,
    rateOwnerOccupied: assumptions.rateOwnerOccupied,
    rateInvestor: assumptions.rateInvestor,
  };

  const bendigo = runFunderCalc(
    inputs,
    bendigoFunder,
    data.hem_bendigo,
    data.tax_brackets_FY2627,
    data.medicare_FY2526
  );
  const colcap = runFunderCalc(
    inputs,
    colcapFunder,
    data.hem_colcap,
    data.tax_brackets_FY2627,
    data.medicare_FY2526
  );

  const bendigoMax = bendigo.maxBorrowing;
  const colcapMax = colcap.maxBorrowing;
  const varianceDollar = colcapMax - bendigoMax;
  const variancePct = bendigoMax === 0 ? 0 : varianceDollar / bendigoMax;
  const direction = varianceDollar > 0 ? "ColCap estimates higher" : varianceDollar < 0 ? "ColCap estimates lower" : "No difference";

  return { bendigo, colcap, bendigoMax, colcapMax, varianceDollar, variancePct, direction };
}

export const DEFAULT_ASSUMPTIONS = {
  rateOwnerOccupied: 0.0903,
  rateInvestor: 0.0903,
  bendigo: { otherIncomeShade: 0.8, creditCardRate: 0.038 },
  colcap: { otherIncomeShade: 1.0, creditCardRate: 0.03 },
};
