import type { PolicySnapshot, TaxTableVersion, BenchmarkTable, HecsBand } from "./types.js";

/** FY2026-27 resident tax brackets (policy §3.3), effective 1 July 2026. */
const taxTableFy2026_27: TaxTableVersion = {
  id: "tax-fy2026-27",
  effectiveFrom: "2026-07-01",
  brackets: [
    { minCents: 0, maxCents: 1_820_000, rateBps: 0 },
    { minCents: 1_820_001, maxCents: 4_500_000, rateBps: 1500 },
    { minCents: 4_500_001, maxCents: 13_500_000, rateBps: 3000 },
    { minCents: 13_500_001, maxCents: 19_000_000, rateBps: 3700 },
    { minCents: 19_000_001, maxCents: null, rateBps: 4500 },
  ],
};

/** FY2027-28 pre-loaded future-dated table — second bracket falls to 14% (legislated). */
const taxTableFy2027_28: TaxTableVersion = {
  id: "tax-fy2027-28",
  effectiveFrom: "2027-07-01",
  brackets: [
    { minCents: 0, maxCents: 1_820_000, rateBps: 0 },
    { minCents: 1_820_001, maxCents: 4_500_000, rateBps: 1400 },
    { minCents: 4_500_001, maxCents: 13_500_000, rateBps: 3000 },
    { minCents: 13_500_001, maxCents: 19_000_000, rateBps: 3700 },
    { minCents: 19_000_001, maxCents: null, rateBps: 4500 },
  ],
};

/** HECS/HELP FY2026-27 marginal bands (policy §3.3). */
const hecsBandsFy2026_27: HecsBand[] = [
  { thresholdCents: 0, upperBoundCents: 6_952_800, baseCents: 0, marginalRateBps: 0, flatOnTotal: false },
  { thresholdCents: 6_952_800, upperBoundCents: 12_971_700, baseCents: 0, marginalRateBps: 1500, flatOnTotal: false },
  { thresholdCents: 12_971_700, upperBoundCents: 18_605_000, baseCents: 902_835, marginalRateBps: 1700, flatOnTotal: false },
  { thresholdCents: 18_605_000, upperBoundCents: null, baseCents: 0, marginalRateBps: 1000, flatOnTotal: true },
];

/** Proxy benchmark table v1 (policy §4, DL-011) — PLACEHOLDER figures for build/testing only. */
const benchmarkTableV1: BenchmarkTable = {
  id: "benchmark-proxy-v1",
  effectiveFrom: "2026-07-01",
  location: "National",
  bands: [
    { label: "<=$80k", minAnnualCents: 0, maxAnnualCents: 8_000_000 },
    { label: "$80-130k", minAnnualCents: 8_000_001, maxAnnualCents: 13_000_000 },
    { label: "$130-190k", minAnnualCents: 13_000_001, maxAnnualCents: 19_000_000 },
    { label: ">$190k", minAnnualCents: 19_000_001, maxAnnualCents: null },
  ],
  singleNoDependantsMonthlyCents: [215_000, 245_000, 275_000, 310_000],
  coupleNoDependantsMonthlyCents: [325_000, 360_000, 395_000, 440_000],
  perDependantChildMonthlyCents: [85_000, 90_000, 95_000, 100_000],
};

/** The initial (v1) settings — Serviceability Policy document, all sections. */
export function createV1PolicySnapshot(): PolicySnapshot {
  return {
    id: "policy-v1",
    effectiveDate: "2026-07-01",
    label: "Serviceability Policy v1 (FY2026-27)",
    assessmentRates: {
      bufferBps: 300,
      floorRateBps: 525,
    },
    incomeShadingBps: {
      baseSalary: 10_000,
      overtime: 8000,
      bonusCommission: 8000,
      casual: 8000,
      rentalIncome: 8000,
      selfEmployed: 10_000,
      foreignIncome: 8000,
      investmentIncome: 8000,
      governmentBenefits: 10_000,
    },
    essentialServicesOvertimeShadingBps: 10_000,
    creditCardMonthlyFactorBps: 380,
    benchmarkTables: [benchmarkTableV1],
    taxTables: [taxTableFy2026_27, taxTableFy2027_28],
    medicareLevyRateBps: 200,
    lito: {
      enabled: true,
      maxOffsetCents: 70_000,
      taper1RateBps: 500,
      taper1ThresholdCents: 3_750_000,
      taper2RateBps: 150,
      taper2ThresholdCents: 4_500_000,
    },
    hecsBands: hecsBandsFy2026_27,
    dtiFlagThreshold: 6.0,
    lvrFlagThresholdBps: 8000,
    lvrWarningThresholdBps: 9000,
    negativeGearingCutoffDateTime: "2026-05-12T19:30:00+10:00",
  };
}
