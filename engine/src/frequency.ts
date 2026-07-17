import { type Cents, roundHalfAwayFromZero } from "./money.js";

/** Fixed conversion factors per policy §3.2 / requirements §4.5. */
export type Frequency = "weekly" | "fortnightly" | "monthly" | "annual";

export function toMonthly(amountCents: Cents, frequency: Frequency): Cents {
  switch (frequency) {
    case "weekly":
      return roundHalfAwayFromZero((amountCents * 52) / 12);
    case "fortnightly":
      return roundHalfAwayFromZero((amountCents * 26) / 12);
    case "monthly":
      return amountCents;
    case "annual":
      return roundHalfAwayFromZero(amountCents / 12);
  }
}

export function toAnnual(amountCents: Cents, frequency: Frequency): Cents {
  switch (frequency) {
    case "weekly":
      return amountCents * 52;
    case "fortnightly":
      return amountCents * 26;
    case "monthly":
      return amountCents * 12;
    case "annual":
      return amountCents;
  }
}
