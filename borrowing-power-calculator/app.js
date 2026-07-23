import { computeBoth } from "./calc.js";

const scenarioForm = document.getElementById("scenario-form");
const assumptionsForm = document.getElementById("assumptions-form");
const structureSelect = document.getElementById("structure-select");
const resultsPanel = document.getElementById("results-panel");

const money = (n) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const pct = (n) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

let data = null;

async function loadData() {
  const res = await fetch("./calc_data.json");
  data = await res.json();
}

function readScenarioInputs() {
  const fd = new FormData(scenarioForm);
  return {
    loanType: fd.get("loanType"),
    structure: fd.get("structure"),
    dependants: Number(fd.get("dependants")),
    primaryIncome: Number(fd.get("primaryIncome")),
    primaryOther: Number(fd.get("primaryOther")),
    secondaryIncome: Number(fd.get("secondaryIncome")),
    secondaryOther: Number(fd.get("secondaryOther")),
    creditCardLimit: Number(fd.get("creditCardLimit")),
    otherMonthlyCommitments: Number(fd.get("otherMonthlyCommitments")),
    declaredMonthlyExpenses: Number(fd.get("declaredMonthlyExpenses")),
    loanTermMonths: Number(fd.get("loanTermMonths")),
  };
}

function readAssumptions() {
  const fd = new FormData(assumptionsForm);
  return {
    rateOwnerOccupied: Number(fd.get("rateOwnerOccupied")),
    rateInvestor: Number(fd.get("rateInvestor")),
    bendigo: {
      otherIncomeShade: Number(fd.get("bendigoOtherIncomeShade")),
      creditCardRate: Number(fd.get("bendigoCreditCardRate")),
    },
    colcap: {
      otherIncomeShade: Number(fd.get("colcapOtherIncomeShade")),
      creditCardRate: Number(fd.get("colcapCreditCardRate")),
    },
  };
}

function updateCoupleFieldState() {
  const isCouple = structureSelect.value === "Couple";
  document.querySelectorAll(".couple-only").forEach((el) => {
    el.classList.toggle("disabled", !isCouple);
    const input = el.querySelector("input");
    if (input) input.disabled = !isCouple;
  });
}

function breakdownRows(funder) {
  return [
    { label: "Total gross income", value: money(funder.totalGrossIncome) },
    { label: "Other-income shade", value: `${(funder.otherIncomeShade * 100).toFixed(0)}%`, driver: true },
    { label: "Total tax + Medicare", value: money(funder.totalTax) },
    { label: "Net annual income", value: money(funder.netAnnual) },
    { label: "Net monthly income", value: money(funder.netMonthly) },
    { label: "HEM (monthly)", value: money(funder.hemMonthly), driver: true },
    { label: "Declared vs HEM used", value: money(funder.expensesUsed) },
    { label: "Credit card rate", value: `${(funder.creditCardRate * 100).toFixed(2)}%`, driver: true },
    { label: "Credit card assessed (monthly)", value: money(funder.creditCardMonthly) },
    { label: "Other commitments (monthly)", value: money(funder.otherMonthlyCommitments) },
    { label: "Total monthly expenses", value: money(funder.totalMonthlyExpenses) },
    { label: "Net available (monthly)", value: money(funder.netAvailableMonthly) },
    { label: "Assessment rate (no buffer)", value: `${(funder.rate * 100).toFixed(2)}%` },
    { label: "Max borrowing", value: money(funder.maxBorrowing), result: true },
  ];
}

function renderBreakdown(tableEl, funder) {
  tableEl.innerHTML = "";
  for (const row of breakdownRows(funder)) {
    const tr = document.createElement("tr");
    if (row.driver) tr.classList.add("driver-row");
    if (row.result) tr.classList.add("result-row");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = row.label;
    const tdValue = document.createElement("td");
    tdValue.textContent = row.value;
    tr.append(tdLabel, tdValue);
    tableEl.append(tr);
  }
}

function render(result) {
  resultsPanel.hidden = false;
  document.getElementById("bendigo-max").textContent = money(result.bendigoMax);
  document.getElementById("colcap-max").textContent = money(result.colcapMax);
  document.getElementById("variance-value").textContent = `${result.varianceDollar >= 0 ? "+" : ""}${money(result.varianceDollar)} (${pct(result.variancePct)})`;
  document.getElementById("variance-direction").textContent = result.direction;

  renderBreakdown(document.getElementById("bendigo-breakdown"), result.bendigo);
  renderBreakdown(document.getElementById("colcap-breakdown"), result.colcap);
}

function calculate() {
  if (!data) return;
  const inputs = readScenarioInputs();
  const assumptions = readAssumptions();
  const result = computeBoth(inputs, assumptions, data);
  render(result);
}

structureSelect.addEventListener("change", updateCoupleFieldState);
scenarioForm.addEventListener("submit", (e) => {
  e.preventDefault();
  calculate();
});
assumptionsForm.addEventListener("input", () => {
  if (!resultsPanel.hidden) calculate();
});

updateCoupleFieldState();
loadData().then(calculate);
