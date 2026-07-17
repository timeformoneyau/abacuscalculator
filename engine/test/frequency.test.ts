import { describe, expect, it } from "vitest";
import { toAnnual, toMonthly } from "../src/frequency.js";

describe("frequency conversion", () => {
  it("converts weekly to monthly (x52/12)", () => {
    expect(toMonthly(100_000, "weekly")).toBe(433_333); // 1000 * 52/12 = 4333.33...
  });

  it("converts fortnightly to monthly (x26/12)", () => {
    expect(toMonthly(100_000, "fortnightly")).toBe(216_667); // 1000 * 26/12 = 2166.66...
  });

  it("leaves monthly unchanged", () => {
    expect(toMonthly(100_000, "monthly")).toBe(100_000);
  });

  it("converts annual to monthly (÷12)", () => {
    expect(toMonthly(120_000, "annual")).toBe(10_000);
    expect(toMonthly(100_000, "annual")).toBe(8_333); // 8333.33 -> 8333
  });

  it("converts to annual", () => {
    expect(toAnnual(10_000, "weekly")).toBe(520_000);
    expect(toAnnual(10_000, "fortnightly")).toBe(260_000);
    expect(toAnnual(10_000, "monthly")).toBe(120_000);
    expect(toAnnual(10_000, "annual")).toBe(10_000);
  });
});
