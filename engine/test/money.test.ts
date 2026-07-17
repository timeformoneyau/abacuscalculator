import { describe, expect, it } from "vitest";
import { applyBps, centsToDollars, clampCents, dollarsToCents, roundHalfAwayFromZero, sumCents } from "../src/money.js";

describe("money", () => {
  it("converts dollars to cents", () => {
    expect(dollarsToCents(123.45)).toBe(12345);
    expect(dollarsToCents(0.1)).toBe(10);
  });

  it("converts cents to dollars", () => {
    expect(centsToDollars(12345)).toBe(123.45);
  });

  it("rounds half away from zero, symmetrically for negatives", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
  });

  it("applies basis-point rates with rounding", () => {
    expect(applyBps(10_000, 8000)).toBe(8000); // 80% of $100.00
    expect(applyBps(333, 1500)).toBe(50); // 15% of $3.33 = 49.95 -> 50
  });

  it("sums cents", () => {
    expect(sumCents([100, 200, 300])).toBe(600);
    expect(sumCents([])).toBe(0);
  });

  it("clamps to a floor", () => {
    expect(clampCents(-500)).toBe(0);
    expect(clampCents(500)).toBe(500);
    expect(clampCents(-500, -1000)).toBe(-500);
  });
});
