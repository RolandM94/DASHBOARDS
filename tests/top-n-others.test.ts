import assert from "node:assert/strict";
import test from "node:test";
import { topNWithOthers } from "../lib/reports/topNOthers.ts";

test("topNWithOthers — returns all rows when under N", () => {
  const rows = [
    { region: "North", sales: 100 },
    { region: "South", sales: 80 },
    { region: "East", sales: 60 },
  ];
  const result = topNWithOthers(rows, "sales", "region", 5);
  assert.equal(result.length, 3);
  assert.equal(result[0].region, "North");
});

test("topNWithOthers — returns top N + Others row when over N", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    rows.push({ item: `Item ${i}`, value: 100 - i });
  }
  const result = topNWithOthers(rows, "value", "item", 10);
  assert.equal(result.length, 11);
  assert.equal(result[10].item, "Others");

  const expectedSum = Array.from({ length: 10 }, (_, i) => 90 - i).reduce((a, b) => a + b, 0);
  assert.equal(result[10].value, expectedSum);
});

test("topNWithOthers — sorted descending before taking top N", () => {
  const rows = [
    { category: "A", count: 10 },
    { category: "B", count: 5 },
    { category: "C", count: 100 },
    { category: "D", count: 1 },
    { category: "E", count: 50 },
    { category: "F", count: 30 },
    { category: "G", count: 70 },
    { category: "H", count: 40 },
    { category: "I", count: 20 },
    { category: "J", count: 80 },
    { category: "K", count: 90 },
    { category: "L", count: 60 },
  ];
  const result = topNWithOthers(rows, "count", "category", 5);
  assert.equal(result.length, 6);
  assert.equal(result[0].category, "C");
  assert.equal(result[0].count, 100);
  assert.equal(result[4].category, "L");
  assert.equal(result[5].category, "Others");
});

test("topNWithOthers — empty array returns empty", () => {
  const result = topNWithOthers([], "sales", "region", 10);
  assert.equal(result.length, 0);
});

test("topNWithOthers — n=0 returns all rows unchanged", () => {
  const rows = [
    { x: "a", y: 1 },
    { x: "b", y: 2 },
    { x: "c", y: 3 },
  ];
  const result = topNWithOthers(rows, "y", "x", 0);
  assert.equal(result.length, 3);
});

test("topNWithOthers — metric not present returns all rows", () => {
  const rows = [
    { x: "a", y: 1 },
    { x: "b", y: 2 },
  ];
  // Only 2 rows but would trigger top-N if metric existed. Since metric "z" doesn't exist,
  // sort comparison yields 0-0=0 for all rows. top 2 are first 2. Still returns all.
  const result = topNWithOthers(rows, "z", "x", 1);
  assert.equal(result.length, 2);
});
