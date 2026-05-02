import assert from "node:assert/strict";
import test from "node:test";
import { asRecord, asRecordArray, cleanJsonResponse, linkedRecords } from "../lib/reports/sectionGeneratorCore.ts";
import { titleFromPayload, shouldIncludeAppendix, shouldIncludeAuditNote, shouldIncludeCharts, sanitizeFilename } from "../lib/reports/exportEngineCore.ts";

// ── asRecord (from sectionGeneratorCore) ─────────────────────────────────────

test("asRecord returns empty object for null/undefined/array/primitive", () => {
  assert.deepEqual(asRecord(null), {});
  assert.deepEqual(asRecord(undefined), {});
  assert.deepEqual(asRecord([]), {});
  assert.deepEqual(asRecord("string"), {});
  assert.deepEqual(asRecord(42), {});
});

test("asRecord returns the object for valid plain objects", () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
  assert.deepEqual(asRecord({}), {});
});

// ── asRecordArray ────────────────────────────────────────────────────────────

test("asRecordArray returns empty array for non-array values", () => {
  assert.deepEqual(asRecordArray(null), []);
  assert.deepEqual(asRecordArray(undefined), []);
  assert.deepEqual(asRecordArray("string"), []);
  assert.deepEqual(asRecordArray({}), []);
});

test("asRecordArray filters out non-object items", () => {
  const input = [{ id: 1 }, null, "string", 42, { id: 2 }];
  assert.deepEqual(asRecordArray(input), [{ id: 1 }, { id: 2 }]);
});

test("asRecordArray returns empty array when no valid objects", () => {
  assert.deepEqual(asRecordArray([null, "a", 42]), []);
});

// ── cleanJsonResponse ────────────────────────────────────────────────────────

test("cleanJsonResponse strips markdown code fences", () => {
  const raw = "```json\n{\"key\": \"value\"}\n```";
  assert.equal(cleanJsonResponse(raw), '{"key": "value"}');
});

test("cleanJsonResponse strips code fences without language tag", () => {
  assert.equal(cleanJsonResponse("```\nhello\n```"), "hello");
});

test("cleanJsonResponse returns trimmed content without fences", () => {
  assert.equal(cleanJsonResponse("  hello  "), "hello");
});

test("cleanJsonResponse handles missing closing fence", () => {
  assert.equal(cleanJsonResponse("```json\nhello"), "hello");
});

// ── linkedRecords ────────────────────────────────────────────────────────────

test("linkedRecords filters records to matching IDs", () => {
  const records = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(linkedRecords(records, ["a", "c"]), [{ id: "a" }, { id: "c" }]);
});

test("linkedRecords returns empty array when no IDs match", () => {
  const records = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(linkedRecords(records, ["x", "y"]), []);
});

test("linkedRecords uses custom idField", () => {
  const records = [{ key: "x" }, { key: "y" }];
  assert.deepEqual(linkedRecords(records, ["x"], "key"), [{ key: "x" }]);
});

test("linkedRecords handles missing idField gracefully", () => {
  const records = [{ name: "a" }];
  assert.deepEqual(linkedRecords(records, ["a"]), []);
});

// ── titleFromPayload ─────────────────────────────────────────────────────────

test("titleFromPayload extracts title from payload", () => {
  assert.equal(titleFromPayload({ title: "My Report" }), "My Report");
});

test("titleFromPayload returns default for missing title", () => {
  assert.equal(titleFromPayload({}), "Report");
  assert.equal(titleFromPayload({ title: "" }), "Report");
  assert.equal(titleFromPayload({ title: "   " }), "Report");
});

test("titleFromPayload returns default for non-string title", () => {
  assert.equal(titleFromPayload({ title: 42 }), "Report");
  assert.equal(titleFromPayload({ title: null }), "Report");
});

// ── shouldIncludeAppendix ────────────────────────────────────────────────────

test("shouldIncludeAppendix defaults to true", () => {
  assert.equal(shouldIncludeAppendix(), true);
  assert.equal(shouldIncludeAppendix({}), true);
});

test("shouldIncludeAppendix respects camelCase option", () => {
  assert.equal(shouldIncludeAppendix({ includeAppendix: false }), false);
  assert.equal(shouldIncludeAppendix({ includeAppendix: true }), true);
});

test("shouldIncludeAppendix respects snake_case option (takes priority)", () => {
  assert.equal(shouldIncludeAppendix({ include_appendix: false, includeAppendix: true }), false);
});

// ── shouldIncludeAuditNote ──────────────────────────────────────────────────

test("shouldIncludeAuditNote defaults to true", () => {
  assert.equal(shouldIncludeAuditNote(), true);
});

test("shouldIncludeAuditNote respects camelCase and snake_case", () => {
  assert.equal(shouldIncludeAuditNote({ includeAuditNote: false }), false);
  assert.equal(shouldIncludeAuditNote({ include_audit_note: false }), false);
});

// ── shouldIncludeCharts ──────────────────────────────────────────────────────

test("shouldIncludeCharts defaults to true", () => {
  assert.equal(shouldIncludeCharts(), true);
});

test("shouldIncludeCharts respects camelCase and snake_case", () => {
  assert.equal(shouldIncludeCharts({ includeCharts: false }), false);
  assert.equal(shouldIncludeCharts({ include_charts: false }), false);
});

// ── sanitizeFilename (comprehensive) ─────────────────────────────────────────

test("sanitizeFilename normalizes special characters", () => {
  assert.equal(sanitizeFilename("Quarterly Sales / Performance Report!"), "quarterly-sales-performance-report");
});

test("sanitizeFilename trims whitespace", () => {
  assert.equal(sanitizeFilename("  Hello World  "), "hello-world");
});

test("sanitizeFilename returns 'report' for empty input", () => {
  assert.equal(sanitizeFilename(""), "report");
  assert.equal(sanitizeFilename("   "), "report");
});

test("sanitizeFilename limits to 96 characters", () => {
  const long = "a".repeat(200);
  assert.equal(sanitizeFilename(long).length, 96);
});
