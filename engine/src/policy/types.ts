import type { Cents, Bps } from "../money.js";
import type { IncomeType } from "../types.js";

/**
 * All policy parameters resolve into an immutable PolicySnapshot before
 * reaching the engine (requirements §5, CLAUDE.md). The engine never reads
 * "current" settings directly — every calculation is a pure function of
 * (input, PolicySnapshot, assessmentDate).
 */

export interface TaxBracket {
  /** Inclusive lower bound of annual taxable income for this bracket. */
  minCents: Cents;
  /** Inclusive upper bound; null = no upper bound. */
  maxCents: Cents | null;
  rateBps: Bps;
}

export interface TaxTableVersion {
  id: string;
  effectiveFrom: string;
  brackets: TaxBracket[];
}

export interface LitoParams {
  enabled: boolean;
  maxOffsetCents: Cents;
  taper1RateBps: Bps;
  taper1ThresholdCents: Cents;
  taper2RateBps: Bps;
  taper2ThresholdCents: Cents;
}

/**
 * HECS/HELP marginal band. Repayment = baseCents + (repaymentIncome - thresholdCents) * marginalRateBps,
 * except for a flat-on-total band (policy §3.3 top band), where repayment = repaymentIncome * marginalRateBps.
 * A band applies while repaymentIncome <= upperBoundCents (null = catch-all top band).
 */
export interface HecsBand {
  thresholdCents: Cents;
  upperBoundCents: Cents | null;
  baseCents: Cents;
  marginalRateBps: Bps;
  flatOnTotal: boolean;
}

export interface IncomeBand {
  label: string;
  minAnnualCents: Cents;
  maxAnnualCents: Cents | null;
}

/** Proxy benchmark table (policy §4, DL-011) — household type x gross annual household income band. */
export interface BenchmarkTable {
  id: string;
  effectiveFrom: string;
  location: string;
  bands: IncomeBand[];
  singleNoDependantsMonthlyCents: Cents[];
  coupleNoDependantsMonthlyCents: Cents[];
  perDependantChildMonthlyCents: Cents[];
}

export type IncomeShadingTable = Record<IncomeType, Bps>;

export interface PolicySnapshot {
  id: string;
  effectiveDate: string;
  label: string;
  assessmentRates: {
    bufferBps: Bps;
    floorRateBps: Bps;
  };
  incomeShadingBps: IncomeShadingTable;
  /** Overtime shading override for essential-services occupations (policy §3.1.2). */
  essentialServicesOvertimeShadingBps: Bps;
  creditCardMonthlyFactorBps: Bps;
  benchmarkTables: BenchmarkTable[];
  taxTables: TaxTableVersion[];
  medicareLevyRateBps: Bps;
  lito: LitoParams;
  hecsBands: HecsBand[];
  dtiFlagThreshold: number;
  lvrFlagThresholdBps: Bps;
  lvrWarningThresholdBps: Bps;
  /** ISO 8601 datetime — properties acquired before this are Regime A (grandfathered). */
  negativeGearingCutoffDateTime: string;
}
