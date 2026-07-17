import { describe, expect, it } from "vitest";
import { selectBenchmarkTable, selectTaxTable } from "../src/policy/select.js";
import { createV1PolicySnapshot } from "../src/policy/snapshot.js";

const policy = createV1PolicySnapshot();

describe("policy table selection", () => {
  it("picks the latest table effective on or before the assessment date", () => {
    expect(selectTaxTable(policy, "2026-07-01").id).toBe("tax-fy2026-27");
    expect(selectTaxTable(policy, "2027-07-01").id).toBe("tax-fy2027-28");
  });

  it("throws when no version is effective yet (misconfigured assessment date)", () => {
    expect(() => selectTaxTable(policy, "2020-01-01")).toThrow();
    expect(() => selectBenchmarkTable(policy, "2020-01-01")).toThrow();
  });
});
