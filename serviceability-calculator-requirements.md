# Home Loan Serviceability Calculator — Requirements

**Status:** Draft v1.0
**Date:** 17 July 2026
**Purpose:** Source requirements artefact for building a home loan serviceability calculator for credit assessors. Intended to be provided to Claude Code as the build specification.

---

## 1. Purpose & Scope

A web-based serviceability calculator for **home loan assessment**, used by credit assessors to determine whether an applicant can service a proposed loan, and by admins to maintain the lending policy settings that drive the calculations.

Out of scope for v1: loan origination workflow, document collection, credit bureau integration, pricing/rate quoting.

## 2. Users & Roles

| Role | Capabilities |
|---|---|
| **Credit Assessor** | Run assessments; view results and full drill-down; save and export assessment records; view (but not edit) current policy settings. |
| **Admin** | Everything an assessor can do, plus: edit serviceability settings (buffer rate, floor rate, shading rules, HEM tables, liability treatment rules); manage users and roles; view the settings audit log. |

Role model must be extensible — future roles (e.g. reviewer/read-only, team lead approval) should be addable without rework.

## 3. Functional Requirements

### 3.1 Assessment Inputs

The assessor enters or selects:

1. **Applicant & household** — number of applicants, number of dependants, relationship status, postcode/location (drives HEM lookup).
2. **Income** (per applicant, with frequency conversion — weekly/fortnightly/monthly/annual):
   - Base salary (PAYG)
   - Overtime
   - Bonus / commission
   - Casual income
   - Rental income (existing and proposed investment property)
   - Self-employed income
   - Government benefits / other income
3. **Expenses:**
   - Declared living expenses (itemised or total)
   - HEM benchmark is retrieved automatically from the household profile (see 3.4)
4. **Liabilities:**
   - Existing home loans (balance, rate, remaining term, repayment type)
   - Credit cards (limit, not just balance)
   - Personal loans / car loans (repayment, remaining term)
   - HECS/HELP balance
   - Buy-now-pay-later / other commitments
5. **Proposed loan** — amount, term, repayment type (P&I / interest-only period), product rate.

### 3.2 Calculation Engine

1. **Assessed income** = gross income with policy shading applied per income type (e.g. overtime and bonus shaded to a configurable %, rental income shaded to a configurable %). Every shading step must be individually inspectable.
2. **Assessed expenses** = the **higher of** declared living expenses and the applicable HEM benchmark. Both figures, and which one was used, must be recorded and displayed.
3. **Assessed liabilities:**
   - Existing mortgage repayments assessed at the **higher of** actual rate + buffer and the floor rate, over remaining term.
   - Credit cards assessed at a configurable % of **limit** (default 3.8%/month) regardless of balance.
   - HECS/HELP calculated via the ATO **marginal repayment bands** (configurable versioned table; FY2026-27: nil below $69,528, then 15%/17% marginal, flat 10% above the top threshold), applied to repayment income including net investment loss add-backs.
   - Other loans at actual repayments (with configurable buffer treatment).
4. **Proposed loan repayment** assessed at the **higher of** product rate + buffer and the floor rate. Interest-only loans assessed on the P&I repayment over the residual P&I term.
5. **Outputs:**
   - **Net Monthly Surplus (NMS)** — assessed income − assessed expenses − assessed liabilities − assessed proposed repayment.
   - **Debt-to-Income (DTI)** — total debt including the proposed loan ÷ gross annual income (APRA convention). Definition must be documented in-app.
   - **Maximum Borrowing Amount** — solver that iterates the proposed loan amount until NMS reaches zero, using the buffered assessment rate, the entered term, and P&I repayments. Assumptions used by the solver must be displayed alongside the result.
   - Pass/fail or surplus/shortfall indicator per policy.

The engine must be implemented as **pure, deterministic functions**, fully separated from the UI, returning all intermediate values (pre- and post-shading income lines, HEM vs declared comparison, per-liability assessed repayments, rates used). A test suite of known scenarios with expected outputs is required.

### 3.3 Results UI & Drill-Down

1. **Visual hierarchy:** headline metrics (NMS, DTI, max borrowing, pass/fail) displayed prominently at the top; component sections (Income, Expenses, Liabilities, Proposed Loan) below.
2. Every headline figure supports **drill-down**: expanding a component reveals the raw input, the rule applied (e.g. "Overtime shaded to 80% per policy v12"), the intermediate value, and the final assessed value — sufficient for an assessor to reproduce the root calculation by hand.
3. The HEM figure used, the declared expenses figure, the HEM table version, and which of the two was applied must be clearly shown.
4. All rates (product rate, buffer, floor, assessment rate actually used) must be visible in the drill-down.

### 3.4 HEM Support

1. HEM benchmark looked up from household composition (applicants, dependants, income band, location).
2. HEM tables are **versioned**. Admins can upload/enter a new quarterly table; each assessment records the table version it used.
3. The UI shows the HEM value, the version/effective date of the table, and the lookup parameters.

### 3.5 Saved Assessments & Export

1. Any assessment can be **saved as an immutable record**: all inputs, all intermediate calculations, all outputs, and a **frozen snapshot of every policy setting in force at assessment time** (buffer, floor, shading rules, HEM table version, liability rules).
2. Saved records are reproducible: reopening a record re-runs the engine against the snapshotted settings and must produce identical numbers, regardless of subsequent settings changes.
3. Export to **PDF** (formatted single-view report mirroring the results UI including drill-down detail) and **JSON** (machine-readable full record) for hindsight reviews.
4. Records capture: assessor identity, timestamp, unique reference ID, and settings snapshot version references.

### 3.6 Settings Administration

Admin-editable, each with effective-dating and full version history:

1. Serviceability **buffer rate** (e.g. +3.00%)
2. **Floor rate**
3. **Income shading percentages** per income type
4. **Credit card assessment %** of limit
5. **HEM tables** (versioned uploads)
6. **HECS/HELP marginal repayment bands** (versioned table)
7. **Income tax tables, Medicare levy rate, LITO parameters** (versioned; future-dated versions supported)
8. DTI thresholds / policy limits for pass-fail indicators
9. **LVR policy thresholds** (flag and warning levels)

Settings changes never mutate history — they create a new version with an effective date. Assessors see current settings read-only.

### 3.7 Audit Trail

1. Every settings change logs: who, when, old value, new value.
2. Every saved assessment logs: who ran it, when, which settings versions applied.
3. Audit log is viewable by admins and exportable.

## 4. Non-Functional Requirements

1. **Auditability & reproducibility** are first-class: a hindsight reviewer must be able to fully reconstruct any past assessment from its saved record alone.
2. **Role-based access control** enforced server-side, not just hidden in the UI.
3. Calculation engine covered by automated tests (unit tests per rule; scenario tests end-to-end); target 100% coverage of the engine.
4. Currency handling: all money values in AUD, calculations avoiding floating-point drift (integer cents or decimal type).
5. Frequency conversions use consistent, documented factors (e.g. weekly × 52 ÷ 12 for monthly).
6. Seamless assessor UX: single-page assessment flow, sensible tab order, keyboard-friendly, instant recalculation on input change.

## 5. Suggested Architecture Notes (for Claude Code)

- **Separation:** `engine/` (pure calculation functions, no I/O), `api/` (persistence, auth, settings versioning), `ui/` (rendering of engine outputs — the drill-down renders engine intermediates, it never re-derives values).
- Settings resolved into an immutable `PolicySnapshot` object passed into the engine; saved assessments persist the snapshot.
- Start with a scenario test fixture set (e.g. single PAYG applicant; couple with dependants and rental income; applicant with HECS and credit cards) with hand-verified expected outputs.

## 6. Resolved Questions

All original open questions are resolved — see the **Decision Log** (serviceability-calculator-decision-log.md) for full rationale. Summary:

1. **Authentication (DL-001):** Standalone accounts for MVP (admin-created, no self-registration), behind an auth abstraction so SSO can be added later.
2. **Deployment (DL-002):** Cloud hosting in an Australian region; dummy/test data only until a security hardening pass is completed.
3. **Expenses (DL-003):** MVP uses two buckets — 'Basic' and 'Non-Basic' — with Basic compared against HEM (assessed expenses = higher of Basic and HEM, plus Non-Basic). Data model stores expenses as categorised line items to support future HEM-mapped categories.
4. **Joint liabilities (DL-004):** Shared liabilities apportioned by each applicant's ownership %, entered per liability, validated to 100%, and shown in the drill-down.
5. **LVR (DL-005):** In scope for MVP — property value input, LVR shown with the headline metrics, admin-configurable LVR threshold. Deposit composition deferred.

## 7. MVP Additions From Decisions

The following flow into earlier sections and take precedence where they differ:

- **3.1 Inputs:** add property value (for LVR) and per-liability ownership % for shared liabilities; expenses captured as 'Basic' and 'Non-Basic' line items.
- **3.2 Engine:** assessed expenses = higher of Basic and HEM, plus Non-Basic; liabilities assessed at applicant's ownership share; LVR = proposed loan ÷ property value.
- **3.3 Results:** LVR joins the headline metrics; drill-down shows Basic vs HEM comparison and liability ownership splits.
- **3.6 Settings:** add admin-configurable LVR policy threshold.

## 8. Investment Lending, Negative Gearing & Tax Engine (added 17 July 2026 — DL-006 to DL-010)

The authoritative parameter values live in the **Serviceability Policy** (serviceability-policy.md); this section defines the functional behaviour.

1. **Scope:** investment loans supported alongside owner-occupier. Eligibility rules are out of calculator scope.
2. **Property flags:** every investment property records (a) acquisition timing relative to 7:30pm AEST 12 May 2026 (grandfathered vs post-Budget) and (b) new-build status. These route the property into:
   - **Regime A (full negative gearing):** grandfathered properties and post-Budget new builds — net rental losses reduce taxable income in full via the tax engine.
   - **Regime B (quarantined):** post-Budget established properties — losses deductible only against the household's aggregate residential rental income, down to $0; excess quarantined with **no serviceability value**. Assessed on the enduring post-1-July-2027 treatment from day one (DL-007). Cash shortfalls always hit the Net Monthly Surplus in full regardless of regime.
3. **Tax engine:** gross-to-net per applicant using versioned tables — FY2026-27 resident brackets, 2% Medicare levy, LITO (toggleable), HECS/HELP marginal bands — with future-dated table versions supported (FY2027-28 pre-loaded). HECS repayment income adds back net investment losses.
4. **Drill-down obligations:** the results UI must show, per investment property: regime applied and why (flag values), net rental result, its tax treatment (deducted vs quarantined amount), and the flow into taxable income, HECS repayment income, and NMS.
5. **Scenario tests:** the engine test suite must include at minimum — Regime A negatively geared property; Regime B loss fully quarantined; mixed portfolio where a Regime B loss partially offsets another property's rental income; HECS add-back interaction with a Regime A loss.
