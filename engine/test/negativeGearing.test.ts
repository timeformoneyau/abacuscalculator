import { describe, expect, it } from "vitest";
import { computeNegativeGearing } from "../src/negativeGearing.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";
import type { InvestmentProperty } from "../src/types.js";

const policy = createV1PolicySnapshot();

function property(overrides: Partial<InvestmentProperty> & Pick<InvestmentProperty, "id">): InvestmentProperty {
  return {
    ownership: [{ applicantId: "a1", sharePct: 100 }],
    grossRentalIncomeCents: 0,
    rentalFrequency: "monthly",
    deductiblePropertyCostsAnnualCents: 0,
    loanBalanceCents: 0,
    actualInterestRateBps: 0,
    acquisitionDateTime: "2020-01-01T00:00:00+10:00",
    isNewBuild: false,
    ...overrides,
  };
}

describe("regime routing", () => {
  it("routes grandfathered properties (acquired before the cutoff) to Regime A", () => {
    const result = computeNegativeGearing([property({ id: "p1", acquisitionDateTime: "2020-01-01T00:00:00+10:00" })], policy);
    expect(result.properties[0]!.regime).toBe("A");
  });

  it("routes post-Budget established properties to Regime B", () => {
    const result = computeNegativeGearing(
      [property({ id: "p1", acquisitionDateTime: "2026-06-01T00:00:00+10:00", isNewBuild: false })],
      policy,
    );
    expect(result.properties[0]!.regime).toBe("B");
  });

  it("routes post-Budget new builds to Regime A even though acquired after the cutoff", () => {
    const result = computeNegativeGearing(
      [property({ id: "p1", acquisitionDateTime: "2026-06-01T00:00:00+10:00", isNewBuild: true })],
      policy,
    );
    expect(result.properties[0]!.regime).toBe("A");
  });

  it("treats a property acquired exactly at the cutoff instant as Post-Budget (not grandfathered)", () => {
    const result = computeNegativeGearing(
      [property({ id: "p1", acquisitionDateTime: policy.negativeGearingCutoffDateTime, isNewBuild: false })],
      policy,
    );
    expect(result.properties[0]!.regime).toBe("B");
  });
});

describe("net rental result", () => {
  it("hand-verified: assessed rental (80%) less deductible costs less actual interest", () => {
    const result = computeNegativeGearing(
      [
        property({
          id: "p1",
          grossRentalIncomeCents: 200_000, // $2,000/mo
          deductiblePropertyCostsAnnualCents: 300_000, // $3,000/yr
          loanBalanceCents: 40_000_000, // $400,000
          actualInterestRateBps: 500, // 5%
        }),
      ],
      policy,
    );
    const p = result.properties[0]!;
    expect(p.assessedRentalIncomeAnnualCents).toBe(1_920_000); // 80% of $24,000
    expect(p.actualInterestAnnualCents).toBe(2_000_000); // 5% of $400,000
    expect(p.netRentalResultAnnualCents).toBe(-380_000); // -$3,800 loss
  });
});

describe("scenario: Regime A negatively geared property", () => {
  it("flows the full loss through to taxable income, even with no offsetting income", () => {
    const result = computeNegativeGearing(
      [
        property({
          id: "p1",
          acquisitionDateTime: "2020-01-01T00:00:00+10:00", // grandfathered
          grossRentalIncomeCents: 200_000,
          deductiblePropertyCostsAnnualCents: 300_000,
          loanBalanceCents: 40_000_000,
          actualInterestRateBps: 500,
        }),
      ],
      policy,
    );
    expect(result.properties[0]!.regime).toBe("A");
    expect(result.properties[0]!.taxableContributionAnnualCents).toBe(-380_000);
    expect(result.properties[0]!.quarantinedLossAnnualCents).toBe(0);
    expect(result.regimeALossesAnnualCents).toBe(-380_000);
    expect(result.taxableIncomeContributionAnnualCents).toBe(-380_000);
    expect(result.investmentLossAddBackAnnualCents).toBe(380_000);
  });
});

describe("scenario: Regime B loss fully quarantined", () => {
  it("gives no serviceability value to a Regime B loss when there is no offsetting rental income", () => {
    const result = computeNegativeGearing(
      [
        property({
          id: "p1",
          acquisitionDateTime: "2026-06-01T00:00:00+10:00", // post-Budget, established
          grossRentalIncomeCents: 150_000,
          deductiblePropertyCostsAnnualCents: 200_000,
          loanBalanceCents: 45_000_000,
          actualInterestRateBps: 600,
        }),
      ],
      policy,
    );
    const p = result.properties[0]!;
    expect(p.regime).toBe("B");
    expect(p.netRentalResultAnnualCents).toBe(-1_460_000);
    expect(p.taxableContributionAnnualCents).toBe(0);
    expect(p.quarantinedLossAnnualCents).toBe(-1_460_000);
    expect(result.taxableIncomeContributionAnnualCents).toBe(0);
    expect(result.investmentLossAddBackAnnualCents).toBe(0);
  });
});

describe("scenario: mixed portfolio — Regime B loss partially offsets another property's rental income", () => {
  it("caps the deductible Regime B loss at the household's positive residential rental income, quarantining the excess", () => {
    const gainingPropertyA = property({
      id: "gain",
      acquisitionDateTime: "2020-01-01T00:00:00+10:00", // Regime A, positive
      grossRentalIncomeCents: 250_000,
      deductiblePropertyCostsAnnualCents: 200_000,
      loanBalanceCents: 24_000_000,
      actualInterestRateBps: 500,
    });
    const losingPropertyB = property({
      id: "loss",
      acquisitionDateTime: "2026-06-01T00:00:00+10:00", // Regime B, negative
      grossRentalIncomeCents: 150_000,
      deductiblePropertyCostsAnnualCents: 200_000,
      loanBalanceCents: 45_000_000,
      actualInterestRateBps: 600,
    });
    const result = computeNegativeGearing([gainingPropertyA, losingPropertyB], policy);

    const gain = result.properties.find((p) => p.propertyId === "gain")!;
    const loss = result.properties.find((p) => p.propertyId === "loss")!;
    expect(gain.netRentalResultAnnualCents).toBe(1_000_000);
    expect(loss.netRentalResultAnnualCents).toBe(-1_460_000);

    expect(result.totalGainsAnnualCents).toBe(1_000_000);
    expect(result.regimeBLossesTotalAnnualCents).toBe(-1_460_000);
    expect(result.deductibleRegimeBLossAnnualCents).toBe(-1_000_000);
    expect(result.quarantinedRegimeBLossAnnualCents).toBe(-460_000);
    expect(loss.taxableContributionAnnualCents).toBe(-1_000_000);
    expect(loss.quarantinedLossAnnualCents).toBe(-460_000);
    expect(result.taxableIncomeContributionAnnualCents).toBe(0); // 1,000,000 gain - 1,000,000 deductible loss
    expect(result.investmentLossAddBackAnnualCents).toBe(1_000_000);
  });
});

describe("proportional allocation with rounding drift", () => {
  it("allocates a capped Regime B loss across three equal-magnitude properties without losing a cent", () => {
    const gain = property({
      id: "gain",
      acquisitionDateTime: "2020-01-01T00:00:00+10:00",
      grossRentalIncomeCents: 250_000,
      deductiblePropertyCostsAnnualCents: 200_000,
      loanBalanceCents: 24_000_000,
      actualInterestRateBps: 500,
    }); // netResult = +1,000,000, the offset pool
    const losses = ["b1", "b2", "b3"].map((id) =>
      property({
        id,
        acquisitionDateTime: "2026-06-01T00:00:00+10:00",
        loanBalanceCents: 20_000_000,
        actualInterestRateBps: 500, // interest = 1,000,000 -> netResult = -1,000,000 each
      }),
    );
    const result = computeNegativeGearing([gain, ...losses], policy);

    // Pool of 1,000,000 split three ways over a 3,000,000 total loss = 333,333.33 each.
    const allocations = losses.map((l) => result.properties.find((p) => p.propertyId === l.id)!.taxableContributionAnnualCents);
    expect(allocations.reduce((a, b) => a + b, 0)).toBe(-1_000_000); // sums exactly despite the rounding
    expect(allocations.filter((a) => a === -333_333)).toHaveLength(2);
    expect(allocations.filter((a) => a === -333_334)).toHaveLength(1); // the rounding remainder lands on one property
  });
});
