import { computeBoth, DEFAULT_ASSUMPTIONS, DEFAULT_INPUTS, CLEARED_INPUTS } from "./calc.js";

const root = document.getElementById("app");

let data = null;
const state = {
  inp: { ...DEFAULT_INPUTS },
  a: { ...DEFAULT_ASSUMPTIONS },
  open: { breakdown: true, assum: false, hem: false, notes: false },
};

const fmtMoney = (n) => "$" + Math.round(n).toLocaleString("en-AU");
const fmtSigned = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmtMoney(Math.abs(n));
const fmtField = (n) => (n === 0 ? "0" : Math.round(n).toLocaleString("en-AU"));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function parseInt10(str) {
  const n = parseInt(String(str).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
function parsePercent(str) {
  const n = parseFloat(str);
  if (isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function bandLabel(hemTable, idx) {
  const bounds = hemTable.band_lower_bounds;
  const lo = bounds[idx];
  const hi = bounds[idx + 1];
  return hi ? `$${lo.toLocaleString("en-AU")}–$${hi.toLocaleString("en-AU")}` : `$${lo.toLocaleString("en-AU")}+`;
}

function moneyField(field, value, disabled) {
  return `
    <label class="field${disabled ? " dim" : ""}">
      <span class="field-label">${field.label}</span>
      <div class="money-wrap">
        <span class="money-prefix">$</span>
        <input class="money-input" data-field="${field.name}" data-kind="money" value="${fmtField(value)}" ${disabled ? "disabled" : ""}/>
      </div>
    </label>`;
}

function renderInputsCard() {
  const { inp } = state;
  const isSingle = inp.structure === "Single";
  return `
  <div class="card">
    <div class="card-header">
      <span class="card-header-title">CUSTOMER INPUTS</span>
      <span class="card-header-desc">entered once, feeds both calculations</span>
      <button class="btn-clear" data-action="clear-all">Clear all</button>
    </div>
    <div class="inputs-grid">
      <div class="inputs-col">
        <div class="inputs-col-title">LOAN</div>
        <label class="field">
          <span class="field-label">Loan type</span>
          <select class="plain-input" data-field="loanType">
            <option value="OO" ${inp.loanType === "OO" ? "selected" : ""}>Owner Occupied</option>
            <option value="INV" ${inp.loanType === "INV" ? "selected" : ""}>Investor</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">Application structure</span>
          <select class="plain-input" data-field="structure">
            <option value="Single" ${inp.structure === "Single" ? "selected" : ""}>Single</option>
            <option value="Couple" ${inp.structure === "Couple" ? "selected" : ""}>Couple</option>
          </select>
        </label>
        <div class="field-row-2">
          <label class="field">
            <span class="field-label">Dependants</span>
            <input class="plain-input" data-field="dependants" data-kind="int" data-max="12" value="${inp.dependants}"/>
          </label>
          <label class="field">
            <span class="field-label">Loan term (yrs)</span>
            <input class="plain-input" data-field="term" data-kind="int" data-max="40" value="${inp.term}"/>
          </label>
        </div>
      </div>

      <div class="inputs-col">
        <div class="inputs-col-title">INCOME <span class="unit">(gross p.a.)</span></div>
        <div class="field-row-2">
          ${moneyField({ name: "primaryIncome", label: "Primary income" }, inp.primaryIncome, false)}
          ${moneyField({ name: "primaryOther", label: "Primary other income" }, inp.primaryOther, false)}
          ${moneyField({ name: "secondaryIncome", label: "Secondary income" }, inp.secondaryIncome, isSingle)}
          ${moneyField({ name: "secondaryOther", label: "Secondary other income" }, inp.secondaryOther, isSingle)}
        </div>
        <div class="field-hint">Other income = rental, bonus, commission — shaded per funder policy.</div>
      </div>

      <div class="inputs-col">
        <div class="inputs-col-title">EXPENSES &amp; COMMITMENTS</div>
        ${moneyField({ name: "ccLimit", label: "Credit card limit (total)" }, inp.ccLimit, false)}
        <div class="field-row-2">
          ${moneyField({ name: "otherMonthly", label: "Other commitments /mo" }, inp.otherMonthly, false)}
          ${moneyField({ name: "livingExpenses", label: "Declared living exp /mo" }, inp.livingExpenses, false)}
        </div>
        <div class="field-hint">Higher of declared expenses and funder HEM is applied.</div>
      </div>
    </div>
  </div>`;
}

function renderResultsZone(computed) {
  const { funderB: B, funderC: C, varianceDollar, variancePct, direction } = computed;
  return `
  <div class="results-grid">
    <div class="result-card funder-b">
      <div class="result-label-row">
        <span class="result-swatch" style="background:#28527a"></span>
        <span class="result-label">FUNDER B MAX BORROWING</span>
      </div>
      <div class="result-figure">${fmtMoney(B.maxBorrowing)}</div>
      <div class="result-subline">Assessed at ${B.assessRate.toFixed(2)}% · surplus ${fmtMoney(B.surplus)}/mo</div>
    </div>
    <div class="result-card funder-c">
      <div class="result-label-row">
        <span class="result-swatch" style="background:#2a6e5e"></span>
        <span class="result-label">FUNDER C MAX BORROWING</span>
      </div>
      <div class="result-figure">${fmtMoney(C.maxBorrowing)}</div>
      <div class="result-subline">Assessed at ${C.assessRate.toFixed(2)}% · surplus ${fmtMoney(C.surplus)}/mo</div>
    </div>
  </div>
  <div class="variance-bar">
    <div class="variance-item">
      <span class="variance-item-label">VARIANCE ($)</span>
      <span class="variance-item-value">${fmtSigned(varianceDollar)}</span>
    </div>
    <div class="variance-item">
      <span class="variance-item-label">VARIANCE (%)</span>
      <span class="variance-item-value">${(variancePct >= 0 ? "+" : "−") + Math.abs(variancePct * 100).toFixed(1)}%</span>
    </div>
    <div class="variance-divider"></div>
    <div class="variance-direction">${esc(direction)}</div>
  </div>`;
}

function diffCell(bVal, cVal, opts) {
  const o = opts || {};
  if (o.noDiff) return `<span class="row-diff"></span>`;
  const raw = o.same ? 0 : cVal - bVal;
  if (Math.abs(raw) < 0.5) return `<span class="row-diff zero">—</span>`;
  const cls = raw > 0 ? "pos" : "neg";
  return `<span class="row-diff ${cls}">${fmtSigned(raw)}</span>`;
}

function breakdownRow(opts) {
  const { label, bDisplay, cDisplay, driver, note, total, bVal, cVal, noDiff, same } = opts;
  const rowClass = driver ? "driver" : total ? "total" : "";
  return `
    <div class="breakdown-row-grid breakdown-row ${rowClass}">
      <div class="row-label-col">
        <div class="row-label-line">
          <span class="row-label">${label}</span>
          ${driver ? '<span class="driver-pill">VARIANCE DRIVER</span>' : ""}
        </div>
        ${note ? `<span class="row-note">${note}</span>` : ""}
      </div>
      <span class="row-value">${bDisplay}</span>
      <span class="row-value">${cDisplay}</span>
      ${diffCell(bVal, cVal, { noDiff, same })}
    </div>`;
}

function renderBreakdownCard(computed) {
  const { inp, a } = state;
  const { funderB: B, funderC: C } = computed;
  const allOpen = state.open.breakdown && state.open.assum && state.open.hem && state.open.notes;

  const hemBBand = bandLabel(data.hem_funder_b, B.hemBandIndex);
  const hemCBand = bandLabel(data.hem_funder_c, C.hemBandIndex);
  const bindsB = B.hemBinds || C.hemBinds;

  const rows = [
    breakdownRow({ label: "Base salary income (gross p.a.)", bDisplay: fmtMoney(B.baseIncome), cDisplay: fmtMoney(C.baseIncome), bVal: B.baseIncome, cVal: C.baseIncome }),
    breakdownRow({
      label: "Other income after shading (p.a.)",
      bDisplay: fmtMoney(B.otherShaded),
      cDisplay: fmtMoney(C.otherShaded),
      bVal: B.otherShaded,
      cVal: C.otherShaded,
      driver: true,
      note: `Declared ${fmtMoney(B.otherRaw)} · shading Funder B ${a.fbShade}% vs Funder C ${a.fcShade}%`,
    }),
    breakdownRow({ label: "Assessable gross income (p.a.)", bDisplay: fmtMoney(B.totalGrossIncome), cDisplay: fmtMoney(C.totalGrossIncome), bVal: B.totalGrossIncome, cVal: C.totalGrossIncome }),
    breakdownRow({
      label: "Income tax (p.a.)",
      bDisplay: "−" + fmtMoney(B.incomeTaxTotal),
      cDisplay: "−" + fmtMoney(C.incomeTaxTotal),
      bVal: -B.incomeTaxTotal,
      cVal: -C.incomeTaxTotal,
      note: "FY2026/27 resident scale, per applicant",
    }),
    breakdownRow({
      label: "Medicare levy (p.a.)",
      bDisplay: "−" + fmtMoney(B.medicareTotal),
      cDisplay: "−" + fmtMoney(C.medicareTotal),
      bVal: -B.medicareTotal,
      cVal: -C.medicareTotal,
      note: "FY2025/26 thresholds (single scale), 10% shade-in band",
    }),
    breakdownRow({ label: "Net income (p.a.)", bDisplay: fmtMoney(B.netAnnual), cDisplay: fmtMoney(C.netAnnual), bVal: B.netAnnual, cVal: C.netAnnual }),
    breakdownRow({ label: "Net income (monthly)", bDisplay: fmtMoney(B.netMonthly), cDisplay: fmtMoney(C.netMonthly), bVal: B.netMonthly, cVal: C.netMonthly, total: true }),
    breakdownRow({
      label: "HEM benchmark (monthly)",
      bDisplay: fmtMoney(B.hemMonthly),
      cDisplay: fmtMoney(C.hemMonthly),
      bVal: B.hemMonthly,
      cVal: C.hemMonthly,
      driver: true,
      note: `Funder B band ${hemBBand} · Funder C band ${hemCBand} — ${inp.structure}, ${inp.dependants} dependant(s)`,
    }),
    breakdownRow({
      label: "Living expenses applied (monthly)",
      bDisplay: fmtMoney(B.livingUsed),
      cDisplay: fmtMoney(C.livingUsed),
      bVal: B.livingUsed,
      cVal: C.livingUsed,
      note: `Higher of HEM and declared ${fmtMoney(inp.livingExpenses)} — ${bindsB ? "HEM binds" : "declared binds"}`,
    }),
    breakdownRow({
      label: "Credit card commitment (monthly)",
      bDisplay: fmtMoney(B.cc),
      cDisplay: fmtMoney(C.cc),
      bVal: B.cc,
      cVal: C.cc,
      driver: true,
      note: `Limit ${fmtMoney(inp.ccLimit)} × Funder B ${a.fbCC}% vs Funder C ${a.fcCC}%`,
    }),
    breakdownRow({ label: "Other commitments (monthly)", bDisplay: fmtMoney(inp.otherMonthly), cDisplay: fmtMoney(inp.otherMonthly), same: true }),
    breakdownRow({
      label: "Total monthly commitments",
      bDisplay: "−" + fmtMoney(B.commitments),
      cDisplay: "−" + fmtMoney(C.commitments),
      bVal: -B.commitments,
      cVal: -C.commitments,
      total: true,
    }),
    breakdownRow({ label: "Net available income (monthly)", bDisplay: fmtMoney(B.surplus), cDisplay: fmtMoney(C.surplus), bVal: B.surplus, cVal: C.surplus, total: true }),
    breakdownRow({
      label: `Assessment rate (rate + ${a.buffer.toFixed(2)}% buffer)`,
      bDisplay: B.assessRate.toFixed(2) + "%",
      cDisplay: C.assessRate.toFixed(2) + "%",
      noDiff: true,
      note: `${inp.loanType === "OO" ? "Owner Occupied" : "Investor"} rate over ${inp.term} years P&amp;I`,
    }),
    breakdownRow({ label: "Maximum borrowing", bDisplay: fmtMoney(B.maxBorrowing), cDisplay: fmtMoney(C.maxBorrowing), bVal: B.maxBorrowing, cVal: C.maxBorrowing, total: true }),
  ].join("");

  return `
  <div class="card">
    <div class="card-header panel-header" data-toggle="breakdown">
      <span class="panel-chevron">${state.open.breakdown ? "▾" : "▸"}</span>
      <span class="card-header-title">CALCULATION BREAKDOWN</span>
      <span class="card-header-desc">every intermediate step, both funders</span>
      <button class="btn-expand" data-action="expand-all">${allOpen ? "Collapse all" : "Expand all"}</button>
    </div>
    ${
      state.open.breakdown
        ? `<div>
      <div class="breakdown-row-grid breakdown-head">
        <span class="breakdown-head-cell">STEP</span>
        <span class="breakdown-head-cell funder-b">FUNDER B</span>
        <span class="breakdown-head-cell funder-c">FUNDER C</span>
        <span class="breakdown-head-cell delta">Δ (FUNDER C − FUNDER B)</span>
      </div>
      ${rows}
    </div>`
        : ""
    }
  </div>`;
}

function renderAssumptionsCard() {
  const { a } = state;
  return `
  <div class="assum-card">
    <div class="assum-header" data-toggle="assum">
      <span class="assum-chevron">${state.open.assum ? "▾" : "▸"}</span>
      <span class="assum-header-title">ASSUMPTIONS — POLICY LEVERS</span>
      <span class="assum-header-desc">settings, not customer data · not affected by Clear all</span>
    </div>
    ${
      state.open.assum
        ? `<div class="assum-body">
      <div class="assum-group">
        <div class="assum-group-title">FUNDER B — INTEREST RATES</div>
        <label class="assum-row">
          <span class="assum-row-label">Owner Occupied</span>
          <input class="assum-input" data-assum="fbRateOO" value="${a.fbRateOO}"/>
          <span class="assum-suffix">% p.a.</span>
        </label>
        <label class="assum-row">
          <span class="assum-row-label">Investor</span>
          <input class="assum-input" data-assum="fbRateINV" value="${a.fbRateINV}"/>
          <span class="assum-suffix">% p.a.</span>
        </label>
      </div>
      <div class="assum-group">
        <div class="assum-group-title">FUNDER C — INTEREST RATES</div>
        <label class="assum-row">
          <span class="assum-row-label">Owner Occupied</span>
          <input class="assum-input" data-assum="fcRateOO" value="${a.fcRateOO}"/>
          <span class="assum-suffix">% p.a.</span>
        </label>
        <label class="assum-row">
          <span class="assum-row-label">Investor</span>
          <input class="assum-input" data-assum="fcRateINV" value="${a.fcRateINV}"/>
          <span class="assum-suffix">% p.a.</span>
        </label>
      </div>
      <div class="assum-group">
        <div class="assum-group-title">CREDIT CARD % OF LIMIT /MO</div>
        <label class="assum-row">
          <span class="assum-row-label">Funder B</span>
          <input class="assum-input" data-assum="fbCC" value="${a.fbCC}"/>
          <span class="assum-suffix">%</span>
        </label>
        <label class="assum-row">
          <span class="assum-row-label">Funder C</span>
          <input class="assum-input" data-assum="fcCC" value="${a.fcCC}"/>
          <span class="assum-suffix">%</span>
        </label>
      </div>
      <div class="assum-group">
        <div class="assum-group-title">OTHER-INCOME SHADING</div>
        <label class="assum-row">
          <span class="assum-row-label">Funder B</span>
          <input class="assum-input" data-assum="fbShade" value="${a.fbShade}"/>
          <span class="assum-suffix">%</span>
        </label>
        <label class="assum-row">
          <span class="assum-row-label">Funder C</span>
          <input class="assum-input" data-assum="fcShade" value="${a.fcShade}"/>
          <span class="assum-suffix">%</span>
        </label>
        <div class="assum-note">% of declared other income counted as assessable.</div>
      </div>
    </div>
    <div class="assum-shared-note">Assessment buffer of +${a.buffer.toFixed(2)}% applied on top of each funder's rate above (fixed model setting, same for both).</div>`
        : ""
    }
  </div>`;
}

function hemRows(hemTable, structure, activeIdx) {
  const bounds = hemTable.band_lower_bounds;
  return bounds
    .map((lo, i) => {
      const hi = bounds[i + 1];
      const label = hi ? `$${lo.toLocaleString("en-AU")}–$${hi.toLocaleString("en-AU")}` : `$${lo.toLocaleString("en-AU")}+`;
      const single = fmtMoney((hemTable.rows.single[i] * 52) / 12);
      const couple = fmtMoney((hemTable.rows.couple[i] * 52) / 12);
      return `<div class="hem-row${i === activeIdx ? " active" : ""}">
        <span class="hem-band">${label}</span>
        <span class="hem-value">${single}</span>
        <span class="hem-value">${couple}</span>
      </div>`;
    })
    .join("");
}

function renderHemCard(computed) {
  const { inp } = state;
  const { funderB: B, funderC: C } = computed;
  const depKey = inp.structure === "Couple" ? "couple_additional" : "single_additional";
  const fbDepMonthly = (data.hem_funder_b.rows[depKey][B.hemBandIndex] * 52) / 12;
  const fcDepMonthly = (data.hem_funder_c.rows[depKey][C.hemBandIndex] * 52) / 12;

  return `
  <div class="card">
    <div class="card-header panel-header" data-toggle="hem">
      <span class="panel-chevron">${state.open.hem ? "▾" : "▸"}</span>
      <span class="card-header-title">HEM TABLES</span>
      <span class="card-header-desc">read-only · monthly benchmark by household income band</span>
    </div>
    ${
      state.open.hem
        ? `<div class="hem-grid">
      <div class="hem-col">
        <div class="hem-col-header">
          <span class="hem-swatch" style="background:#28527a"></span>
          <span class="hem-col-title">FUNDER B HEM</span>
          <span class="hem-col-desc">+ ${fmtMoney(fbDepMonthly)}/mo per dependant (varies by band)</span>
        </div>
        <div class="hem-table-wrap">
          <div class="hem-head-row">
            <span class="hem-head-cell">HOUSEHOLD INCOME</span>
            <span class="hem-head-cell right">SINGLE</span>
            <span class="hem-head-cell right">COUPLE</span>
          </div>
          ${hemRows(data.hem_funder_b, inp.structure, B.hemBandIndex)}
        </div>
      </div>
      <div class="hem-col">
        <div class="hem-col-header">
          <span class="hem-swatch" style="background:#2a6e5e"></span>
          <span class="hem-col-title">FUNDER C HEM</span>
          <span class="hem-col-desc">+ ${fmtMoney(fcDepMonthly)}/mo per dependant (flat $90/wk)</span>
        </div>
        <div class="hem-table-wrap">
          <div class="hem-head-row">
            <span class="hem-head-cell">HOUSEHOLD INCOME</span>
            <span class="hem-head-cell right">SINGLE</span>
            <span class="hem-head-cell right">COUPLE</span>
          </div>
          ${hemRows(data.hem_funder_c, inp.structure, C.hemBandIndex)}
        </div>
      </div>
    </div>
    <div class="hem-footnote">Highlighted row = band applied to the current scenario (${inp.structure}, ${inp.dependants} dependants). Each funder's own table and band boundaries apply independently.</div>`
        : ""
    }
  </div>`;
}

function renderNotesCard() {
  return `
  <div class="card">
    <div class="card-header panel-header" data-toggle="notes">
      <span class="panel-chevron">${state.open.notes ? "▾" : "▸"}</span>
      <span class="card-header-title">ASSUMPTIONS &amp; LIMITATIONS</span>
    </div>
    ${
      state.open.notes
        ? `<div class="notes-body">
      <div class="notes-line">· Acquisition/estimate tool: intentionally simpler than full serviceability.</div>
      <div class="notes-line">· A +${state.a.buffer.toFixed(2)}% serviceability buffer is applied to the entered rate for both funders. Buffer is a fixed model setting, not a per-scenario input.</div>
      <div class="notes-line">· Tax = FY2026/27 resident marginal scale; Medicare = FY2025/26 thresholds with the 10% shade-in band (single scale only) — flagged mismatch.</div>
      <div class="notes-line">· "Other income" is a single lumped field; real policy shades by income type. Modelled as the variable-income treatment (Funder B/Funder C shading levers above).</div>
      <div class="notes-line">· Rental income is NOT separately modelled (falls in "other income").</div>
      <div class="notes-line">· HEM tables are each funder's full published band table (Funder B 15 bands; Funder C 14-band "Australia" table, Q2 2025 placeholder). Funder C's per-dependant add-on is flat $90/week; Funder B's varies by band.</div>
      <div class="notes-line">· Maximum borrowing = present value of the monthly surplus as a P&amp;I annuity over the loan term at the assessed rate, rounded to the nearest $1,000. No LVR, lender caps, or DTI overlays applied.</div>
      <div class="notes-line">· Negative gearing, rental expense offsets, and existing mortgage repayments are out of scope for this comparison.</div>
      <div class="notes-line">· Indicative analysis only — not a credit decision tool.</div>
    </div>`
        : ""
    }
  </div>`;
}

function render() {
  if (!data) return;
  const computed = computeBoth(state.inp, state.a, data);
  root.innerHTML = [renderInputsCard(), renderResultsZone(computed), renderBreakdownCard(computed), renderAssumptionsCard(), renderHemCard(computed), renderNotesCard()].join("");
}

function onChange(e) {
  const t = e.target;

  if (t.dataset.field) {
    const name = t.dataset.field;
    if (t.tagName === "SELECT") {
      state.inp[name] = t.value;
    } else if (t.dataset.kind === "int") {
      const max = t.dataset.max ? Number(t.dataset.max) : undefined;
      const v = parseInt10(t.value);
      state.inp[name] = max !== undefined ? Math.min(v, max) : v;
    } else if (t.dataset.kind === "money") {
      state.inp[name] = parseInt10(t.value);
    }
    render();
    return;
  }

  if (t.dataset.assum) {
    state.a[t.dataset.assum] = parsePercent(t.value);
    render();
  }
}

function onClick(e) {
  const clearBtn = e.target.closest('[data-action="clear-all"]');
  if (clearBtn) {
    state.inp = { ...CLEARED_INPUTS };
    render();
    return;
  }

  const expandBtn = e.target.closest('[data-action="expand-all"]');
  if (expandBtn) {
    const allOpen = state.open.breakdown && state.open.assum && state.open.hem && state.open.notes;
    const v = !allOpen;
    state.open = { breakdown: v, assum: v, hem: v, notes: v };
    render();
    return;
  }

  const toggle = e.target.closest("[data-toggle]");
  if (toggle) {
    const key = toggle.dataset.toggle;
    state.open[key] = !state.open[key];
    render();
  }
}

root.addEventListener("change", onChange);
root.addEventListener("click", onClick);

async function loadData() {
  const res = await fetch("./calc_data.json");
  data = await res.json();
}

loadData().then(render);
