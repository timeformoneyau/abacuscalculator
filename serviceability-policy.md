# Serviceability Policy — Home Loan Assessment

**Status:** Draft v1.0 — approved parameters per Decision Log DL-006 to DL-011
**Date:** 17 July 2026
**Companions:** serviceability-calculator-requirements.md, serviceability-calculator-decision-log.md
**Purpose:** Defines every parameter, rule, and table used by the serviceability calculator. Each numbered setting maps to an admin-configurable, versioned value in the application (requirements §3.6). All values below are the **initial (v1) settings**; the application's settings history is the source of truth thereafter.

---

## 1. Scope

Applies to owner-occupier and investment home loan assessments. Eligibility (employment tenure minimums, probation, acceptable income types) is **out of scope** — the calculator assesses whatever income the assessor enters. Loan purposes: purchase and refinance, P&I and interest-only.

## 2. Assessment Rates

| # | Setting | Initial value | Basis |
|---|---|---|---|
| 2.1 | Serviceability buffer | **+3.00 percentage points** | APRA macroprudential setting, held at 3% (reaffirmed June 2026) |
| 2.2 | Floor rate | **5.25% p.a.** | Industry-typical lender floor (APRA removed the blanket floor in 2019; lenders set their own) |
| 2.3 | Assessment rate rule | Higher of (rate + buffer) and floor | APG 223 convention |

Applies to: the proposed loan, and all existing mortgage debt (at each facility's actual rate + buffer vs floor, over remaining term). Interest-only loans (proposed or existing) are assessed on **P&I repayments over the residual P&I term** (e.g. 5 years IO on a 30-year term → assessed as P&I over 25 years).

## 3. Income Policy

### 3.1 Gross income treatment (shading)

| # | Income type | Assessed at | Notes |
|---|---|---|---|
| 3.1.1 | Base salary / PAYG | 100% | |
| 3.1.2 | Overtime | **80%** | Essential-services override: **100%** (flag per applicant; police, nursing, paramedic, fire, ADF) |
| 3.1.3 | Bonus / commission | **80%** | Applied to the figure the assessor enters (averaging is an assessor judgement, not engine logic) |
| 3.1.4 | Casual income | **80%** | |
| 3.1.5 | Rental income — existing & proposed | **80%** of gross | Covers vacancy, agent fees, maintenance |
| 3.1.6 | Self-employed income | 100% of entered figure | Assessor enters the averaged/verified figure |
| 3.1.7 | Foreign income | **80%** (AUD-converted) | |
| 3.1.8 | Investment income (non-property) | **80%** | |
| 3.1.9 | Government benefits / other | 100% of entered figure | Acceptability is an assessor judgement |

All shading percentages are individually configurable per income type. The drill-down must show gross → shading rule and version → assessed figure for every line.

### 3.2 Frequency conversion (fixed factors)

Weekly × 52 ÷ 12; fortnightly × 26 ÷ 12; annual ÷ 12. All engine math in monthly terms, integer cents.

### 3.3 Gross-to-net (tax engine)

Net income is computed per applicant from assessed gross taxable income using versioned tables:

**Income tax — residents, FY2026-27 (effective 1 July 2026):**

| Taxable income | Rate |
|---|---|
| $0 – $18,200 | 0% |
| $18,201 – $45,000 | 15% |
| $45,001 – $135,000 | 30% |
| $135,001 – $190,000 | 37% |
| $190,001+ | 45% |

Pre-loaded future version (effective 1 July 2027): second bracket falls to 14% (legislated). Assessments always use the table version effective at assessment date.

**Medicare levy:** 2.0% of taxable income. (Low-income reduction and MLS excluded from MVP; configurable placeholder retained.)

**Low Income Tax Offset (LITO):** included, configurable toggle (default ON). Parameters (v1): maximum $700; reduces by 5.0c per $1 of taxable income over $37,500; then by 1.5c per $1 over $45,000; nil from $66,667. Non-refundable — cannot reduce tax below zero.

**HECS/HELP — FY2026-27 marginal system:**

| Repayment income | Repayment |
|---|---|
| $0 – $69,528 | Nil |
| $69,529 – $129,717 | 15c per $1 over $69,528 |
| $129,718 – $186,050 | $9,028.35 + 17c per $1 over $129,717 |
| $186,051+ | Flat 10% of total repayment income |

Applied only where the applicant has a HECS/HELP flag set. **Repayment income = taxable income + net investment losses added back** (plus reportable fringe benefits and reportable super where entered) — note this means negative gearing does *not* reduce HECS repayments; the engine must add rental losses back for this calculation. HECS repayment is treated as a monthly commitment (annual ÷ 12) in the liabilities section of the output, not as a tax line, so assessors can see it distinctly.

## 4. Expenses Policy

1. Declared living expenses captured as **'Basic'** and **'Non-Basic'** line items (DL-003).
2. **Assessed expenses = max(Basic declared, benchmark) + Non-Basic declared.**
3. Benchmark: **proxy HEM table** (below) until licensed Melbourne Institute HEM tables are provided (DL-011). The UI must label the benchmark "Proxy benchmark — not Melbourne Institute HEM" until replaced.
4. Benchmark lookup: household type × gross annual household income band. Location dimension deferred until real HEM tables arrive (schema includes a location field, defaulted to "National").

**Proxy benchmark table v1 — monthly figures, effective 1 July 2026 (PLACEHOLDER — generic figures for build and testing only, not derived from licensed HEM data):**

| Household | ≤$80k | $80–130k | $130–190k | >$190k |
|---|---|---|---|---|
| Single, no dependants | $2,150 | $2,450 | $2,750 | $3,100 |
| Couple, no dependants | $3,250 | $3,600 | $3,950 | $4,400 |
| Per dependant child (add) | $850 | $900 | $950 | $1,000 |

Sole-parent households use the Single row plus dependant loadings. Table is versioned identically to real HEM (quarterly cadence expected once licensed data arrives).

## 5. Liabilities Policy

| # | Liability | Assessed monthly commitment |
|---|---|---|
| 5.1 | Existing mortgages | P&I repayment at higher of (actual rate + 3.00%) and floor 5.25%, over remaining term; IO per §2 |
| 5.2 | Credit cards | **3.8% of approved limit** (regardless of balance) |
| 5.3 | Personal / car loans | Actual contractual repayment |
| 5.4 | BNPL / other | Actual declared commitment |
| 5.5 | HECS/HELP | Per §3.3 marginal calculation |

**Ownership splits (DL-004):** shared liabilities carry an ownership % per applicant (must sum to 100%); each applicant's assessed share reflects their percentage. Liabilities shared between co-applicants on the same assessment are counted once in full at household level. The drill-down shows full facility → split → assessed share.

## 6. Investment Lending & Negative Gearing

Each investment property carries two flags:

- **Acquisition timing:** contracted before 7:30pm AEST 12 May 2026 → *Grandfathered*; otherwise *Post-Budget*.
- **New build:** yes/no (eligible new builds are excluded from the new measures).

### 6.1 Regime A — full negative gearing (Grandfathered properties and Post-Budget new builds)

Net rental losses are deductible against all other income. Engine treatment: the property's net rental result (assessed rental income at 80% less deductible property costs and assessed interest) flows into taxable income in full. A loss therefore reduces tax payable — the serviceability benefit appears automatically through the tax engine (no separate "add-back" step; the tax engine *is* the add-back).

### 6.2 Regime B — quarantined ("deductible down to neutral $0") — Post-Budget established properties

From 1 July 2027, rental losses on these properties are deductible only against residential property income, assessed on an **aggregate basis** across the household's residential portfolio; excess losses are quarantined and carried forward.

Engine treatment:
1. Compute each property's net rental result.
2. Sum Regime B losses. Offset them against the household's remaining positive residential rental income (from any property, either regime), but **not below $0 aggregate**.
3. Any excess Regime B loss is **quarantined: it does not reduce taxable income and is assigned no serviceability value** (carried-forward losses are ignored — conservative, since their future usability is uncertain).
4. Regime A losses are never quarantined — they flow through per §6.1 even if the aggregate is negative.
5. The full cash shortfall of every property (regardless of regime) still hits the Net Monthly Surplus — quarantining affects only the *tax* line, never the *cash* line.

**Transition window (DL-007):** although the tax law permits Regime B properties to negative gear until 30 June 2027, the engine assesses them on the enduring quarantined treatment from day one. Loans are long-dated; a tax benefit expiring within a year is not counted.

**HECS interaction:** any rental loss that does reduce taxable income (Regime A) is added back when computing HECS repayment income (§3.3).

## 7. Output Metrics & Thresholds

| # | Metric | Definition | Threshold behaviour (v1) |
|---|---|---|---|
| 7.1 | Net Monthly Surplus | Assessed net income − assessed expenses − assessed liabilities − assessed proposed repayment | Surplus ≥ $0 = Pass; < $0 = Fail |
| 7.2 | DTI | Total debt including proposed loan ÷ gross annual income | **≥ 6.0 → "High DTI" flag** (not a decline). Portfolio-share tracking vs APRA's 20% new-lending limit is a post-MVP reporting feature (DL-009) |
| 7.3 | LVR | Proposed loan ÷ property value | > 80% → "High LVR" flag; > 90% → prominent warning. Configurable |
| 7.4 | Maximum Borrowing | Largest loan where NMS = $0, at assessment rate (§2), entered term, P&I | Solver assumptions displayed with result |

## 8. Versioned Table Inventory

All of the following are effective-dated, version-historied, snapshotted into every saved assessment: buffer, floor, shading set, credit card factor, benchmark (proxy HEM) table, income tax table, Medicare levy rate, LITO parameters, HECS bands, DTI/LVR thresholds. Pre-loaded at launch: FY2026-27 tax/HECS tables (current) and FY2027-28 tax table (future-dated, 14% second bracket).

## 9. Sources & Review

Parameter sources: APRA macroprudential settings and February 2026 DTI limit announcements; 2026-27 Federal Budget negative gearing measures (12 May 2026); ATO 2026-27 resident tax rates and study-loan repayment thresholds; industry-standard lender conventions for shading, floor, and card factors as documented in the Decision Log.

Review triggers: APRA buffer/DTI announcements; each Federal Budget; annual ATO threshold indexation (1 July); quarterly benchmark updates; receipt of licensed HEM tables (replaces §4 proxy — DL-011).
