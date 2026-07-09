const test = require("node:test");
const assert = require("node:assert");
const { getVerdict, getRequiredFields } = require("./evaluate");

const pmKisanRule = {
  scheme_id: "PM-KISAN",
  name: "PM Kisan Samman Nidhi",
  logic: "AND",
  clauses: [
    { id: "C1", field: "occupation", op: "==", value: "farmer", description: "Must be a farmer" },
    { id: "C2", field: "land_holding_hectares", op: "<=", value: 2.0, description: "Land holding of 2 hectares or less" },
    {
      id: "C3",
      logic: "NOT",
      clauses: [
        {
          id: "C3a",
          field: "occupation_category",
          op: "==",
          value: "institutional_landholder",
          description: "Not an institutional landholder",
        },
      ],
    },
  ],
};

test("eligible profile passes all clauses", () => {
  const profile = {
    occupation: "farmer",
    land_holding_hectares: 1.5,
    occupation_category: "individual",
    pays_income_tax: false,
  };
  const verdict = getVerdict(profile, pmKisanRule);
  assert.strictEqual(verdict.eligible, true);
  assert.strictEqual(verdict.failed_clauses.length, 0);
});

test("boundary case: land holding exactly at threshold is eligible (<=)", () => {
  const profile = {
    occupation: "farmer",
    land_holding_hectares: 2.0,
    occupation_category: "individual",
    pays_income_tax: false,
  };
  const verdict = getVerdict(profile, pmKisanRule);
  assert.strictEqual(verdict.eligible, true);
});

test("boundary case: land holding just over threshold is ineligible", () => {
  const profile = {
    occupation: "farmer",
    land_holding_hectares: 2.01,
    occupation_category: "individual",
    pays_income_tax: false,
  };
  const verdict = getVerdict(profile, pmKisanRule);
  assert.strictEqual(verdict.eligible, false);
  assert.strictEqual(verdict.failed_clauses[0].field, "land_holding_hectares");
});

test("NOT clause correctly excludes institutional landholders", () => {
  const profile = {
    occupation: "farmer",
    land_holding_hectares: 1.0,
    occupation_category: "institutional_landholder",
    pays_income_tax: false,
  };
  const verdict = getVerdict(profile, pmKisanRule);
  assert.strictEqual(verdict.eligible, false);
  assert.strictEqual(verdict.failed_clauses.some((c) => c.id === "C3a"), true);
});

test("missing field is treated as failing, not as passing", () => {
  const profile = { occupation: "farmer" }; // land_holding_hectares missing
  const verdict = getVerdict(profile, pmKisanRule);
  assert.strictEqual(verdict.eligible, false);
});

test("getRequiredFields returns every leaf field referenced by the rule", () => {
  const fields = getRequiredFields(pmKisanRule);
  assert.strictEqual(fields.has("occupation"), true);
  assert.strictEqual(fields.has("land_holding_hectares"), true);
  assert.strictEqual(fields.has("occupation_category"), true);
});
