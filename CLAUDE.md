# Serviceability Calculator — Project Instructions

## What this is
A home loan serviceability calculator for credit assessors, per the three specification documents in /docs:

- **docs/serviceability-calculator-requirements.md** — WHAT to build (functional & non-functional requirements). Authoritative for behaviour.
- **docs/serviceability-policy.md** — THE NUMBERS (rates, shading, tax/HECS tables, benchmark tables, negative gearing regimes). Authoritative for every parameter value.
- **docs/serviceability-calculator-decision-log.md** — WHY (decisions DL-001 to DL-011). Consult before proposing changes to anything already decided; new material decisions should be flagged to the product owner and, once made, added here in the established format.

Read all three before writing code.

## Architecture rules (non-negotiable)
- **engine/**: pure, deterministic calculation functions. No I/O, no framework imports, no dates from the system clock (assessment date is an input). Returns ALL intermediate values (pre/post-shading lines, HEM-vs-declared comparison, per-liability assessed repayments, tax breakdown, negative gearing regime routing) — the UI drill-down renders these; it never re-derives anything.
- **api/**: persistence, auth, settings versioning. Settings resolve into an immutable PolicySnapshot passed into the engine; saved assessments persist the snapshot and must reproduce identical numbers when re-run against it.
- **ui/**: renders engine output. Headline metrics (NMS, DTI, LVR, max borrowing) on top; components below with expandable drill-down.
- Money as integer cents (or a decimal type). Never binary floating point for currency.
- All policy tables (buffer, floor, shading, benchmark, tax, Medicare, LITO, HECS bands, thresholds) are effective-dated and versioned per requirements §3.6. No hardcoded policy values in engine logic.

## Build order
1. Engine + scenario tests (requirements §3.2 and §8; parameter values from the policy doc). Include the four mandatory negative-gearing scenarios in requirements §8.5, plus: single PAYG applicant; couple with dependants and rental income; applicant with HECS and credit cards. Hand-verify expected outputs in test fixtures.
2. Results screen with drill-down (requirements §3.3).
3. Inputs flow (§3.1), save/export (§3.5), settings admin (§3.6), roles & audit (§2, §3.7).

No UI work until the engine test suite passes.

## Domain traps (get these right)
- HECS repayment income ADDS BACK net investment losses — a Regime A negative gearing loss lowers tax but NOT the HECS commitment (policy §3.3).
- Regime B quarantining affects only the TAX line; the property's cash shortfall always hits Net Monthly Surplus in full (policy §6.2).
- Regime B losses offset the household's aggregate residential rental income (any property, either regime) down to $0 — not per-property.
- Assessed expenses = max(Basic declared, benchmark) + Non-Basic (DL-003). Both compared figures and the winner are recorded and displayed.
- Interest-only loans: assess P&I over the RESIDUAL P&I term.
- Credit cards: 3.8%/month of LIMIT, not balance.
- Existing mortgages: higher of (actual rate + buffer) and floor, over remaining term.
- DTI ≥ 6 is a FLAG, never a decline (DL-009).
- The benchmark table is a PROXY, not real HEM — keep the "Proxy benchmark" label in the UI until licensed tables replace it (DL-011).

## Conventions
- Frequency conversions: weekly ×52÷12, fortnightly ×26÷12, annual ÷12; all engine math monthly.
- Current tables: FY2026-27. FY2027-28 tax table (14% second bracket) pre-loaded future-dated.
- Server-side enforcement of roles (admin vs credit assessor); UI hiding is not access control.
