import type { Cents, Bps } from "./money.js";
import type { Frequency } from "./frequency.js";

// ---------------------------------------------------------------------------
// Household & applicants
// ---------------------------------------------------------------------------

export interface Applicant {
  id: string;
  name?: string;
  /** Police, nursing, paramedic, fire, ADF — overrides overtime shading to 100% (policy §3.1.2). */
  essentialServicesOccupation: boolean;
  hasHecsDebt: boolean;
  /** Outstanding HECS/HELP balance — used for DTI only; repayment is income-based, not balance-based. */
  hecsBalanceCents: Cents;
}

export interface Household {
  applicants: Applicant[];
  dependants: number;
  location: string;
}

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

export type IncomeType =
  | "baseSalary"
  | "overtime"
  | "bonusCommission"
  | "casual"
  | "rentalIncome"
  | "selfEmployed"
  | "foreignIncome"
  | "investmentIncome"
  | "governmentBenefits";

export interface IncomeLine {
  id: string;
  applicantId: string;
  type: IncomeType;
  amountCents: Cents;
  frequency: Frequency;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export type ExpenseCategory = "basic" | "nonBasic";

export interface ExpenseLine {
  id: string;
  category: ExpenseCategory;
  amountCents: Cents;
  frequency: Frequency;
}

// ---------------------------------------------------------------------------
// Liabilities
// ---------------------------------------------------------------------------

/** Ownership shares must sum to 100 across all entries on a liability (policy §5, DL-004). */
export interface OwnershipShare {
  applicantId: string;
  sharePct: number;
}

export type RepaymentType = "principalAndInterest" | "interestOnly";

export interface ExistingMortgageLiability {
  kind: "existingMortgage";
  id: string;
  balanceCents: Cents;
  interestRateBps: Bps;
  remainingTermMonths: number;
  repaymentType: RepaymentType;
  /** Months of interest-only remaining; residual P&I term = remainingTermMonths - ioRemainingMonths. */
  ioRemainingMonths?: number;
  ownership: OwnershipShare[];
  linkedInvestmentPropertyId?: string;
}

export interface CreditCardLiability {
  kind: "creditCard";
  id: string;
  limitCents: Cents;
  ownership: OwnershipShare[];
}

export interface OtherLoanLiability {
  kind: "otherLoan";
  id: string;
  balanceCents: Cents;
  repaymentAmountCents: Cents;
  frequency: Frequency;
  ownership: OwnershipShare[];
}

export interface BnplLiability {
  kind: "bnpl";
  id: string;
  balanceCents: Cents;
  declaredCommitmentCents: Cents;
  frequency: Frequency;
  ownership: OwnershipShare[];
}

export type Liability =
  | ExistingMortgageLiability
  | CreditCardLiability
  | OtherLoanLiability
  | BnplLiability;

// ---------------------------------------------------------------------------
// Investment properties / negative gearing
// ---------------------------------------------------------------------------

/**
 * A property tracked for full negative-gearing/tax treatment (policy §6, §8).
 * Its rental income reaches taxable/net income solely via its net rental
 * result (§6.1) — do NOT also add a parallel `rentalIncome` IncomeLine for
 * the same property, or the rent is double-counted into taxable income.
 * The property's mortgage (if any) is a normal ExistingMortgageLiability
 * (buffered, in `liabilities`) — that is the "cash line" which always hits
 * NMS in full regardless of the property's tax regime (policy §6.2.5); the
 * net rental result above is the separate "tax line".
 */
export interface InvestmentProperty {
  id: string;
  ownership: OwnershipShare[];
  grossRentalIncomeCents: Cents;
  rentalFrequency: Frequency;
  /** Actual annual deductible property costs excl. interest (rates, insurance, agent fees, repairs). */
  deductiblePropertyCostsAnnualCents: Cents;
  /** Actual loan balance used to compute real (unbuffered) interest for the tax/net-rental-result calc. */
  loanBalanceCents: Cents;
  actualInterestRateBps: Bps;
  /** ISO 8601 datetime the property was contracted. */
  acquisitionDateTime: string;
  isNewBuild: boolean;
}

// ---------------------------------------------------------------------------
// Proposed loan
// ---------------------------------------------------------------------------

export interface ProposedLoan {
  amountCents: Cents;
  termMonths: number;
  repaymentType: RepaymentType;
  ioRemainingMonths?: number;
  productRateBps: Bps;
  propertyValueCents: Cents;
}

// ---------------------------------------------------------------------------
// Assessment input
// ---------------------------------------------------------------------------

export interface AssessmentInput {
  household: Household;
  incomes: IncomeLine[];
  expenses: ExpenseLine[];
  liabilities: Liability[];
  investmentProperties: InvestmentProperty[];
  proposedLoan: ProposedLoan;
  /** ISO 8601 date. Never derived from the system clock (CLAUDE.md). Drives table selection & regime routing. */
  assessmentDate: string;
}
