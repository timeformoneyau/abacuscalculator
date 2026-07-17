import { applyBps, clampCents, type Cents } from "./money.js";
import type { LitoParams, TaxTableVersion } from "./policy/types.js";

export interface TaxBracketLine {
  minCents: Cents;
  maxCents: Cents | null;
  rateBps: number;
  taxableInBracketCents: Cents;
  taxInBracketCents: Cents;
}

export interface TaxComputation {
  taxableIncomeAnnualCents: Cents;
  taxTableId: string;
  brackets: TaxBracketLine[];
  grossIncomeTaxAnnualCents: Cents;
  litoAppliedCents: Cents;
  incomeTaxAfterLitoAnnualCents: Cents;
  medicareLevyAnnualCents: Cents;
  netTaxAnnualCents: Cents;
  netIncomeAnnualCents: Cents;
  netIncomeMonthlyCents: Cents;
}

/** Standard marginal-bracket income tax, applied bracket by bracket (policy §3.3). */
export function computeIncomeTax(taxableIncomeAnnualCents: Cents, table: TaxTableVersion): TaxBracketLine[] {
  const income = Math.max(0, taxableIncomeAnnualCents);
  return table.brackets.map((bracket) => {
    const upper = bracket.maxCents ?? Infinity;
    const taxableInBracketCents = income > bracket.minCents ? Math.min(income, upper) - bracket.minCents : 0;
    return {
      minCents: bracket.minCents,
      maxCents: bracket.maxCents,
      rateBps: bracket.rateBps,
      taxableInBracketCents,
      taxInBracketCents: applyBps(taxableInBracketCents, bracket.rateBps),
    };
  });
}

export function computeLito(taxableIncomeAnnualCents: Cents, lito: LitoParams): Cents {
  if (!lito.enabled) return 0;
  const income = Math.max(0, taxableIncomeAnnualCents);
  let offset = lito.maxOffsetCents;
  if (income > lito.taper1ThresholdCents) {
    // The first taper's reduction freezes at the second threshold — it does not keep
    // growing with income past that point; only the second taper continues from there.
    const taper1Base = Math.min(income, lito.taper2ThresholdCents);
    offset -= applyBps(taper1Base - lito.taper1ThresholdCents, lito.taper1RateBps);
  }
  if (income > lito.taper2ThresholdCents) {
    offset -= applyBps(income - lito.taper2ThresholdCents, lito.taper2RateBps);
  }
  return clampCents(offset);
}

export function computeMedicareLevy(taxableIncomeAnnualCents: Cents, rateBps: number): Cents {
  return applyBps(Math.max(0, taxableIncomeAnnualCents), rateBps);
}

/**
 * Gross-to-net for a single applicant (policy §3.3): marginal tax brackets,
 * non-refundable LITO offset against income tax only, then 2% Medicare levy
 * added back on top. Taxable income here is the calculator's ASSESSED gross
 * taxable income (post-shading + attributed net rental result) — not a real
 * ATO return.
 */
export function computeNetIncome(
  taxableIncomeAnnualCents: Cents,
  taxTable: TaxTableVersion,
  medicareLevyRateBps: number,
  lito: LitoParams,
): TaxComputation {
  const brackets = computeIncomeTax(taxableIncomeAnnualCents, taxTable);
  const grossIncomeTaxAnnualCents = brackets.reduce((sum, b) => sum + b.taxInBracketCents, 0);
  const litoAppliedCents = Math.min(computeLito(taxableIncomeAnnualCents, lito), grossIncomeTaxAnnualCents);
  const incomeTaxAfterLitoAnnualCents = clampCents(grossIncomeTaxAnnualCents - litoAppliedCents);
  const medicareLevyAnnualCents = computeMedicareLevy(taxableIncomeAnnualCents, medicareLevyRateBps);
  const netTaxAnnualCents = incomeTaxAfterLitoAnnualCents + medicareLevyAnnualCents;
  const netIncomeAnnualCents = taxableIncomeAnnualCents - netTaxAnnualCents;
  return {
    taxableIncomeAnnualCents,
    taxTableId: taxTable.id,
    brackets,
    grossIncomeTaxAnnualCents,
    litoAppliedCents,
    incomeTaxAfterLitoAnnualCents,
    medicareLevyAnnualCents,
    netTaxAnnualCents,
    netIncomeAnnualCents,
    netIncomeMonthlyCents: Math.round(netIncomeAnnualCents / 12),
  };
}
