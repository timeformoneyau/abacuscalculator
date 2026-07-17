# Serviceability Calculator — Decision Log

**Companion to:** serviceability-calculator-requirements.md
**Last updated:** 17 July 2026

Each entry records the decision, who made it, the rationale, and any deferred/long-term follow-up. Decisions here supersede the corresponding "Open Questions" in the requirements document.

---

## DL-001 — Authentication Approach

**Status:** Decided
**Decided by:** Claude (delegated by product owner)
**Date:** 17 July 2026

**Decision:** MVP uses **standalone accounts** (email + password, server-side sessions, admin-managed user creation — no self-registration), built behind an **auth abstraction layer** so SSO can be swapped in later without touching the rest of the application.

**Options considered:**

*Option A — Standalone accounts (chosen)*
- Pros: No dependency on corporate IT or identity provider setup; works on day one; full control over the two-role model; simplest path to a working MVP; trivially demoable.
- Cons: Another password for users; you own credential security (hashing, reset flows, lockout); no central deprovisioning — if a staff member leaves, an admin must remember to disable their account.

*Option B — Internal SSO (e.g. Microsoft Entra ID / Google Workspace)*
- Pros: Central identity and deprovisioning; no passwords to manage; stronger enterprise posture; easier future compliance story.
- Cons: Requires IT involvement and an identity provider tenancy before anything works; app registration/approval processes can stall an MVP for weeks; role mapping adds config complexity; harder to demo outside the corporate network.

**Rationale:** Standalone accounts remove all external dependencies from the critical path to MVP while the abstraction layer keeps the SSO door open. The main risks (credential handling, deprovisioning) are mitigated by: using a well-established auth library rather than hand-rolled crypto, admin-only account creation, and an "active/disabled" flag on accounts surfaced on the admin screen.

**Follow-up (post-MVP):** Revisit SSO when the tool moves onto corporate infrastructure or beyond a small user group. The abstraction layer must not be bypassed in the meantime.

---

## DL-002 — Deployment Target & Data Residency

**Status:** Decided
**Decided by:** Product owner (context) + Claude (recommendation)
**Date:** 17 July 2026

**Context provided:** Small team in a single office; MVP will hold dummy/test data only; independent venture — no corporate IT or compliance regime applies.

**Decision:** MVP deployed to **cloud hosting in an Australian region (e.g. Sydney)** — a managed platform or small VM, accessible via browser with login. All application data and backups remain in the AU region from day one.

**Options considered:**

*Local / single machine* — rejected: cannot serve a multi-user team properly; no resilience; dead end beyond proof-of-concept.

*Cloud hosting, AU region (chosen)* — shared browser access for the team; low monthly cost; managed backups; AU data residency established from the start so nothing needs to move later.

*Corporate infrastructure* — not applicable: no corporate IT exists for this venture.

**Rationale:** Cloud is the only option that serves a team, and being an independent venture removes the corporate path entirely. Choosing an AU region now means the data-residency posture is already correct when the tool graduates beyond dummy data.

**Follow-up (trigger: before any real customer data enters the system):** Complete a security hardening pass — enforced HTTPS, encrypted data at rest, tightened access controls, backup/restore testing, dependency update process, and a review of Australian Privacy Principles (APP) obligations, which will apply once personal information is collected. Revisit DL-001 (SSO) at the same time.

---

## DL-003 — Living Expenses Structure

**Status:** Decided
**Decided by:** Product owner
**Date:** 17 July 2026

**Decision:** MVP captures declared living expenses in **two buckets: 'Basic' and 'Non-Basic'**, with the **'Basic' figure compared against HEM** (assessed expenses = higher of Basic and HEM, with Non-Basic added on top as a separate assessed line).

**Long-term direction:** Move to itemised expense **categories mapped to HEM categories**, enabling category-level comparison. The data model should anticipate this: store expenses as line items with a category field from day one (MVP just uses two categories), so migration is additive rather than a restructure.

---

## DL-004 — Joint Liability Treatment (Multi-Applicant)

**Status:** Decided
**Decided by:** Product owner
**Date:** 17 July 2026

**Decision:** Shared liabilities are apportioned by the **ownership percentage of each applicant**. Each liability record therefore carries an ownership split (e.g. 50/50, 70/30), and each applicant's assessed repayment share reflects their percentage.

**Implementation notes:** Ownership % must be an explicit input per liability with validation that splits sum to 100%. The drill-down must show the full liability, the split applied, and each applicant's assessed share. Where the loan being assessed is a joint application assessed as a single household, the split primarily matters for liabilities shared with parties *outside* the application — the UI should make this distinction clear.

---

## DL-005 — LVR & Deposit

**Status:** Decided
**Decided by:** Product owner
**Date:** 17 July 2026

**Decision:** **LVR is in scope for MVP** — inputs for property value and proposed loan amount, LVR displayed alongside the headline metrics, and an admin-configurable LVR policy threshold for the pass/fail indicator. **Deposit composition** (genuine savings, gifts, equity) is **deferred** to a later phase.

---

## DL-006 — Investment Lending & Negative Gearing Scope

**Status:** Decided | **Decided by:** Product owner | **Date:** 17 July 2026

**Decision:** Investment loans are in scope. The engine supports both negative gearing regimes: full offset ("old school") for properties grandfathered before 7:30pm AEST 12 May 2026 and for eligible new builds, and the post-Budget quarantined treatment (losses deductible only against residential property income, aggregate basis, down to $0, excess carried forward) for established properties acquired after that time. Each investment property carries acquisition-timing and new-build flags. Eligibility rules are explicitly out of calculator scope.

---

## DL-007 — Negative Gearing Transition Window

**Status:** Decided | **Decided by:** Claude (recommended), approved by product owner | **Date:** 17 July 2026

**Decision:** Post-Budget established properties are assessed on the **enduring quarantined treatment from day one**, ignoring the temporary ability to negative gear until 30 June 2027. Rationale: loans are long-dated; counting a tax benefit that lapses within a year would overstate capacity. Conservative and simpler to implement.

---

## DL-008 — Non-APRA Default Parameters

**Status:** Decided | **Decided by:** Claude (recommended under delegation), approved by product owner | **Date:** 17 July 2026

**Decision:** Where APRA does not set the number, industry-standard defaults apply: floor rate **5.25%**; overtime, bonus/commission, casual, rental, foreign, and investment income all shaded to **80%** (essential-services overtime at 100%); credit cards at **3.8% of limit per month**. All configurable in admin settings; values recorded in the Serviceability Policy §2, §3, §5.

---

## DL-009 — DTI Treatment

**Status:** Decided | **Decided by:** Claude (recommended), approved by product owner | **Date:** 17 July 2026

**Decision:** DTI ≥ 6.0 raises a prominent **"High DTI" flag**, not a decline — reflecting that APRA's February 2026 measure is a portfolio limit (≤20% of new lending at DTI ≥ 6, owner-occupier and investor books measured separately), not a per-loan prohibition. Portfolio-share monitoring/reporting is deferred post-MVP.

---

## DL-010 — Tax Engine Composition

**Status:** Decided | **Decided by:** Product owner (scope) + Claude (detail) | **Date:** 17 July 2026

**Decision:** Claude builds the gross-to-net engine with versioned tables: FY2026-27 resident income tax brackets (15% second bracket), 2% Medicare levy, LITO (configurable toggle, default ON), and the FY2026-27 HECS/HELP marginal repayment bands ($69,528 threshold). FY2027-28 tax table (14% second bracket, legislated) pre-loaded future-dated. HECS repayment income adds back net investment losses, so negative gearing does not reduce assessed HECS commitments. Medicare low-income reduction and MLS excluded from MVP.

---

## DL-011 — Interim Expense Benchmark (HEM Proxy)

**Status:** Decided | **Decided by:** Product owner | **Date:** 17 July 2026

**Decision:** Real HEM tables are proprietary (Melbourne Institute, commercially licensed). Until the product owner supplies licensed tables, the calculator uses a **generic proxy benchmark table** (Serviceability Policy §4), clearly labelled as a proxy in the UI, stored in the same versioned schema (household type × income band × location) so licensed tables drop in without code change.

---

## Template for future entries

**DL-0XX — Title**
Status / Decided by / Date / Decision / Options considered / Rationale / Follow-up
