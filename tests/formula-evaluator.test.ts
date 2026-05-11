import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFormula, extractFormulaReferences, validateFormula } from "../lib/data/formulaEvaluator.ts";

test("evaluateFormula calculates arithmetic over metric label references", () => {
  const row = { "Total Revenue": 1200, "Total Cost": 700 };
  assert.equal(evaluateFormula("{Total Revenue} - {Total Cost}", row), 500);
  assert.equal(evaluateFormula("({Total Revenue} - {Total Cost}) / {Total Revenue} * 100", row), 41.66666666666667);
});

test("evaluateFormula returns null for non-numeric values and division by zero", () => {
  assert.equal(evaluateFormula("{A} / {B}", { A: 10, B: 0 }), null);
  assert.equal(evaluateFormula("{A} + 2", { A: "not numeric" }), null);
});

test("validateFormula reports unknown references and syntax errors", () => {
  assert.deepEqual(extractFormulaReferences("{A} + {B} + {A}"), ["A", "B"]);
  assert.equal(validateFormula("{A} + {B}", ["A"]).ok, false);
  assert.equal(validateFormula("{A} +", ["A"]).ok, false);
  assert.equal(validateFormula("{A} + 2", ["A"]).ok, true);
});
