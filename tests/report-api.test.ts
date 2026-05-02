import assert from "node:assert/strict";
import test from "node:test";
import {
  REPORT_PROJECT_COLUMNS,
  REPORT_BLUEPRINT_COLUMNS,
  REPORT_SECTION_COLUMNS,
  REPORT_EXPORT_COLUMNS,
  REPORT_SOURCE_SNAPSHOT_COLUMNS,
  REPORT_COMPILATION_COLUMNS,
  REPORT_GENERATION_LOG_COLUMNS,
  REPORT_JOB_COLUMNS,
} from "../lib/reports/api.ts";

// ── Column constants ─────────────────────────────────────────────────────────

test("REPORT_PROJECT_COLUMNS includes all required project fields", () => {
  const required = ["id", "name", "source_type", "status", "created_by", "created_at", "updated_at"];
  for (const field of required) {
    assert.ok(REPORT_PROJECT_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("REPORT_BLUEPRINT_COLUMNS includes all required blueprint fields", () => {
  const required = ["id", "report_project_id", "version", "status", "title", "blueprint_json", "created_at"];
  for (const field of required) {
    assert.ok(REPORT_BLUEPRINT_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("REPORT_SECTION_COLUMNS includes all required section fields", () => {
  const required = ["id", "report_project_id", "section_key", "title", "section_type", "order_index", "status"];
  for (const field of required) {
    assert.ok(REPORT_SECTION_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("REPORT_EXPORT_COLUMNS includes all required export fields", () => {
  const required = ["id", "report_project_id", "format", "file_url", "status", "exported_by", "created_at"];
  for (const field of required) {
    assert.ok(REPORT_EXPORT_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("REPORT_SOURCE_SNAPSHOT_COLUMNS includes all required snapshot fields", () => {
  const required = ["id", "report_project_id", "source_type", "source_id", "active_filters_snapshot", "created_at"];
  for (const field of required) {
    assert.ok(REPORT_SOURCE_SNAPSHOT_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("REPORT_COMPILATION_COLUMNS includes all required compilation fields", () => {
  const required = ["id", "report_project_id", "title", "compiled_payload", "status", "compiled_by"];
  for (const field of required) {
    assert.ok(REPORT_COMPILATION_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("REPORT_GENERATION_LOG_COLUMNS includes all required audit fields", () => {
  const required = ["id", "report_project_id", "user_id", "action_type", "status", "created_at"];
  for (const field of required) {
    assert.ok(REPORT_GENERATION_LOG_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("REPORT_JOB_COLUMNS includes all required job fields", () => {
  const required = ["id", "report_project_id", "job_type", "status", "progress_percent", "current_step", "created_at"];
  for (const field of required) {
    assert.ok(REPORT_JOB_COLUMNS.includes(field), `Missing field: ${field}`);
  }
});

test("all column constants are comma-separated and non-empty", () => {
  const all = [
    REPORT_PROJECT_COLUMNS,
    REPORT_BLUEPRINT_COLUMNS,
    REPORT_SECTION_COLUMNS,
    REPORT_EXPORT_COLUMNS,
    REPORT_SOURCE_SNAPSHOT_COLUMNS,
    REPORT_COMPILATION_COLUMNS,
    REPORT_GENERATION_LOG_COLUMNS,
    REPORT_JOB_COLUMNS,
  ];

  for (const cols of all) {
    assert.ok(cols.length > 0, "Column string should not be empty");
    assert.ok(cols.includes("id"), "Column string should include id");
    const fields = cols.split(", ");
    for (const field of fields) {
      assert.ok(field.length > 0, `Field should not be empty in: "${cols}"`);
      assert.equal(field, field.trim(), `Field should be trimmed in: "${cols}"`);
    }
  }
});
