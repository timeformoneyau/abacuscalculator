import { applyBps, clampCents, roundHalfAwayFromZero, sumCents, type Cents } from "./money.js";
import { toAnnual } from "./frequency.js";
import type { InvestmentProperty } from "./types.js";
import type { PolicySnapshot } from "./policy/types.js";

export type NegativeGearingRegime = "A" | "B";

export interface PropertyNetResult {
  propertyId: string;
  regime: NegativeGearingRegime;
  regimeReason: string;
  assessedRentalIncomeAnnualCents: Cents;
  deductiblePropertyCostsAnnualCents: Cents;
  actualInterestAnnualCents: Cents;
  /** Assessed rental (80%) less deductible costs less actual interest — can be negative (policy §6.1). */
  netRentalResultAnnualCents: Cents;
  /** Portion of netRentalResultAnnualCents that actually flows into taxable income after Regime B capping. */
  taxableContributionAnnualCents: Cents;
  /** Regime B excess loss with no serviceability value (policy §6.2.3). Always <= 0. */
  quarantinedLossAnnualCents: Cents;
}

export interface NegativeGearingResult {
  properties: PropertyNetResult[];
  totalGainsAnnualCents: Cents;
  regimeALossesAnnualCents: Cents;
  regimeBLossesTotalAnnualCents: Cents;
  availableOffsetPoolAnnualCents: Cents;
  deductibleRegimeBLossAnnualCents: Cents;
  quarantinedRegimeBLossAnnualCents: Cents;
  taxableIncomeContributionAnnualCents: Cents;
  /** Positive figure: Regime A losses + the deductible portion of Regime B losses, added back for HECS (policy §3.3, §6.2). */
  investmentLossAddBackAnnualCents: Cents;
}

function determineRegime(property: InvestmentProperty, policy: PolicySnapshot): { regime: NegativeGearingRegime; reason: string } {
  const grandfathered = property.acquisitionDateTime < policy.negativeGearingCutoffDateTime;
  if (grandfathered) {
    return { regime: "A", reason: `Grandfathered — acquired ${property.acquisitionDateTime}, before cutoff ${policy.negativeGearingCutoffDateTime} (policy §6)` };
  }
  if (property.isNewBuild) {
    return { regime: "A", reason: "Post-Budget new build — excluded from quarantining (policy §6.1)" };
  }
  return { regime: "B", reason: `Post-Budget established property — quarantined treatment (policy §6.2)` };
}

function computeNetResult(property: InvestmentProperty, policy: PolicySnapshot) {
  const assessedRentalIncomeAnnualCents = applyBps(
    toAnnual(property.grossRentalIncomeCents, property.rentalFrequency),
    policy.incomeShadingBps.rentalIncome,
  );
  const actualInterestAnnualCents = applyBps(property.loanBalanceCents, property.actualInterestRateBps);
  const netRentalResultAnnualCents =
    assessedRentalIncomeAnnualCents - property.deductiblePropertyCostsAnnualCents - actualInterestAnnualCents;
  return { assessedRentalIncomeAnnualCents, actualInterestAnnualCents, netRentalResultAnnualCents };
}

/**
 * Allocates a capped deductible-loss total across properties proportionally
 * to their share of the uncapped loss, correcting rounding drift on the
 * last property so the parts sum exactly to the whole.
 */
function allocateProportionally(totalToAllocate: Cents, magnitudes: readonly Cents[]): Cents[] {
  const sumMagnitudes = sumCents(magnitudes);
  if (sumMagnitudes === 0) return magnitudes.map(() => 0);
  const shares = magnitudes.map((m) => roundHalfAwayFromZero((totalToAllocate * m) / sumMagnitudes));
  const drift = totalToAllocate - sumCents(shares);
  if (drift !== 0) {
    const lastIndex = shares.length - 1;
    shares[lastIndex] = (shares[lastIndex] ?? 0) + drift;
  }
  return shares;
}

/**
 * Routes each investment property into Regime A (full negative gearing) or
 * Regime B (quarantined, policy §6). Regime B losses offset the household's
 * aggregate positive residential rental income (any property, either
 * regime) down to $0; the excess is quarantined with no serviceability
 * value. Regime A always flows through in full, even if the household
 * aggregate is negative.
 */
export function computeNegativeGearing(
  properties: readonly InvestmentProperty[],
  policy: PolicySnapshot,
): NegativeGearingResult {
  const withRegime = properties.map((property) => {
    const { regime, reason } = determineRegime(property, policy);
    const netResult = computeNetResult(property, policy);
    return { property, regime, reason, ...netResult };
  });

  const totalGainsAnnualCents = sumCents(withRegime.map((p) => clampCents(p.netRentalResultAnnualCents)));
  const regimeALossesAnnualCents = sumCents(
    withRegime.filter((p) => p.regime === "A" && p.netRentalResultAnnualCents < 0).map((p) => p.netRentalResultAnnualCents),
  );
  const regimeBLossProperties = withRegime.filter((p) => p.regime === "B" && p.netRentalResultAnnualCents < 0);
  const regimeBLossesTotalAnnualCents = sumCents(regimeBLossProperties.map((p) => p.netRentalResultAnnualCents));

  const availableOffsetPoolAnnualCents = totalGainsAnnualCents;
  const deductibleRegimeBLossMagnitude = Math.min(-regimeBLossesTotalAnnualCents, availableOffsetPoolAnnualCents);
  const deductibleRegimeBLossAnnualCents = -deductibleRegimeBLossMagnitude;
  const quarantinedRegimeBLossAnnualCents = regimeBLossesTotalAnnualCents - deductibleRegimeBLossAnnualCents;

  const deductibleAllocations = allocateProportionally(
    deductibleRegimeBLossAnnualCents,
    regimeBLossProperties.map((p) => -p.netRentalResultAnnualCents),
  );
  const deductibleByPropertyId = new Map(regimeBLossProperties.map((p, i) => [p.property.id, deductibleAllocations[i] ?? 0]));

  const properties_: PropertyNetResult[] = withRegime.map((p) => {
    let taxableContributionAnnualCents: Cents;
    let quarantinedLossAnnualCents: Cents = 0;
    if (p.netRentalResultAnnualCents >= 0) {
      taxableContributionAnnualCents = p.netRentalResultAnnualCents;
    } else if (p.regime === "A") {
      taxableContributionAnnualCents = p.netRentalResultAnnualCents;
    } else {
      const deductible = deductibleByPropertyId.get(p.property.id) ?? 0;
      taxableContributionAnnualCents = deductible;
      quarantinedLossAnnualCents = p.netRentalResultAnnualCents - deductible;
    }
    return {
      propertyId: p.property.id,
      regime: p.regime,
      regimeReason: p.reason,
      assessedRentalIncomeAnnualCents: p.assessedRentalIncomeAnnualCents,
      deductiblePropertyCostsAnnualCents: p.property.deductiblePropertyCostsAnnualCents,
      actualInterestAnnualCents: p.actualInterestAnnualCents,
      netRentalResultAnnualCents: p.netRentalResultAnnualCents,
      taxableContributionAnnualCents,
      quarantinedLossAnnualCents,
    };
  });

  const taxableIncomeContributionAnnualCents = totalGainsAnnualCents + regimeALossesAnnualCents + deductibleRegimeBLossAnnualCents;
  // "+ 0" normalizes a -0 result (both components zero) to +0 for clean equality/display.
  const investmentLossAddBackAnnualCents = -(regimeALossesAnnualCents + deductibleRegimeBLossAnnualCents) + 0;

  return {
    properties: properties_,
    totalGainsAnnualCents,
    regimeALossesAnnualCents,
    regimeBLossesTotalAnnualCents,
    availableOffsetPoolAnnualCents,
    deductibleRegimeBLossAnnualCents,
    quarantinedRegimeBLossAnnualCents,
    taxableIncomeContributionAnnualCents,
    investmentLossAddBackAnnualCents,
  };
}
