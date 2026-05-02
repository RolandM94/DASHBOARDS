import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportAuditTrail,
  compareReportVersionsFromRows,
} from "../lib/reports/auditTrailCore.ts";

const project = {
  id: "project-1",
  name: "Quarterly Sales Report",
  source_type: "dashboard",
  source_dashboard_id: "dashboard-1",
  source_canvas_id: null,
  report_type: "management_report",
  status: "generated",
  created_by: "user-1",
  created_at: "2026-05-01T08:00:00.000Z",
  updated_at: "2026-05-01T12:00:00.000Z",
};

const snapshots = [
  {
    id: "snapshot-2",
    report_project_id: "project-1",
    source_type: "dashboard",
    source_id: "dashboard-1",
    active_filters_snapshot: { filters: { region: ["North"] } },
    widgets_snapshot: [{ id: "widget-1", title: "Sales by Region" }],
    worksheets_snapshot: [{ id: "worksheet-1", name: "Sales Query" }],
    insights_snapshot: [{ id: "insight-1" }],
    query_outputs_snapshot: { "widget-1": { rows: [{ region: "North", sales: 1200 }] } },
    metadata: {
      source: { title: "Sales Dashboard" },
      warnings: [{ message: "Widget 2 could not be captured." }],
    },
    created_at: "2026-05-01T09:00:00.000Z",
  },
];

const blueprints = [
  {
    id: "blueprint-2",
    report_project_id: "project-1",
    version: 2,
    status: "approved",
    title: "Sales Report v2",
    objective: "Explain sales.",
    audience: "Leadership",
    blueprint_json: { previous_blueprint_id: "blueprint-1" },
    generated_by_ai: false,
    approved_by: "user-1",
    approved_at: "2026-05-01T10:00:00.000Z",
    created_at: "2026-05-01T09:30:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
  },
  {
    id: "blueprint-1",
    report_project_id: "project-1",
    version: 1,
    status: "superseded",
    title: "Sales Report v1",
    objective: "Explain sales.",
    audience: "Leadership",
    blueprint_json: {},
    generated_by_ai: true,
    approved_by: "user-1",
    approved_at: "2026-05-01T09:20:00.000Z",
    created_at: "2026-05-01T09:10:00.000Z",
    updated_at: "2026-05-01T09:20:00.000Z",
  },
];

const sections = [
  {
    id: "section-1",
    report_project_id: "project-1",
    report_blueprint_id: "blueprint-1",
    section_key: "executive-summary",
    title: "Executive Summary",
    section_type: "executive_summary",
    order_index: 1,
    source_widget_ids: ["widget-1"],
    source_worksheet_ids: ["worksheet-1"],
    source_insight_ids: ["insight-1"],
    status: "generated",
    generated_content: "Summary.",
    edited_content: null,
    metadata: {
      generated_output: {
        model: "claude-test",
        generated_at: "2026-05-01T10:10:00.000Z",
        source_snapshot_id: "snapshot-2",
        warnings: ["Review supporting data."],
      },
    },
    created_at: "2026-05-01T09:11:00.000Z",
    updated_at: "2026-05-01T10:10:00.000Z",
  },
  {
    id: "section-2",
    report_project_id: "project-1",
    report_blueprint_id: "blueprint-2",
    section_key: "executive-summary",
    title: "Executive Overview",
    section_type: "executive_summary",
    order_index: 1,
    source_widget_ids: ["widget-1"],
    source_worksheet_ids: ["worksheet-1"],
    source_insight_ids: ["insight-1"],
    status: "generated",
    generated_content: "Overview.",
    edited_content: null,
    metadata: { generated_output: { model: "claude-test", generated_at: "2026-05-01T10:30:00.000Z" } },
    created_at: "2026-05-01T09:31:00.000Z",
    updated_at: "2026-05-01T10:30:00.000Z",
  },
  {
    id: "section-3",
    report_project_id: "project-1",
    report_blueprint_id: "blueprint-2",
    section_key: "appendix",
    title: "Appendix",
    section_type: "appendix",
    order_index: 2,
    source_widget_ids: [],
    source_worksheet_ids: [],
    source_insight_ids: [],
    status: "failed",
    generated_content: null,
    edited_content: null,
    metadata: {},
    created_at: "2026-05-01T09:32:00.000Z",
    updated_at: "2026-05-01T10:31:00.000Z",
  },
];

const compilations = [
  {
    id: "compilation-1",
    report_project_id: "project-1",
    report_blueprint_id: "blueprint-2",
    source_snapshot_id: "snapshot-2",
    title: "Sales Report v2",
    compiled_payload: {
      metadata: { section_count: 2 },
      audit_note: { note_text: "Generated from Sales Dashboard." },
    },
    status: "compiled",
    compiled_by: "user-1",
    created_at: "2026-05-01T11:00:00.000Z",
    updated_at: "2026-05-01T11:00:00.000Z",
  },
];

const exports = [
  {
    id: "export-1",
    report_project_id: "project-1",
    report_blueprint_id: "blueprint-2",
    format: "pdf",
    file_url: "/api/reports/exports/export-1/download",
    file_path: "report-exports/export-1.pdf",
    export_config: {
      compilation_id: "compilation-1",
      source_snapshot_id: "snapshot-2",
    },
    status: "exported",
    exported_by: "user-1",
    exported_at: "2026-05-01T11:10:00.000Z",
    created_at: "2026-05-01T11:10:00.000Z",
  },
];

const logs = [
  {
    id: "log-1",
    report_project_id: "project-1",
    user_id: "user-1",
    action_type: "generate_section",
    input_payload: { report_section_id: "section-1" },
    output_summary: { warning_count: 1 },
    ai_model: "claude-test",
    status: "success",
    error_message: null,
    created_at: "2026-05-01T10:10:00.000Z",
  },
  {
    id: "log-2",
    report_project_id: "project-1",
    user_id: "user-1",
    action_type: "generate_section",
    input_payload: { report_section_id: "section-3" },
    output_summary: {},
    ai_model: "claude-test",
    status: "failed",
    error_message: "Section generation failed.",
    created_at: "2026-05-01T10:31:00.000Z",
  },
];

test("buildReportAuditTrail returns complete traceability", () => {
  const audit = buildReportAuditTrail({
    project,
    snapshots,
    blueprints,
    sections,
    compilations,
    exports,
    logs,
  });

  assert.equal(audit.source.latest_source_snapshot_id, "snapshot-2");
  assert.deepEqual(audit.traceability.widget_ids_used, ["widget-1"]);
  assert.deepEqual(audit.traceability.worksheet_ids_used, ["worksheet-1"]);
  assert.deepEqual(audit.traceability.query_output_ids_used, ["widget-1"]);
  assert.deepEqual(audit.traceability.ai_models_used, ["claude-test"]);
  assert.equal(audit.traceability.failed_action_count, 1);
  assert.equal(audit.exports[0].source_snapshot_id, "snapshot-2");
  assert.equal(audit.compilations[0].audit_note.note_text, "Generated from Sales Dashboard.");
  assert.ok(audit.warnings.includes("Widget 2 could not be captured."));
  assert.ok(audit.warnings.includes("Section generation failed."));
});

test("compareReportVersionsFromRows reports section and title differences", () => {
  const comparison = compareReportVersionsFromRows({
    reportProjectId: "project-1",
    versionA: 1,
    versionB: 2,
    blueprints,
    sections,
    compilations,
  });

  assert.equal(comparison.blueprint_a.title, "Sales Report v1");
  assert.equal(comparison.blueprint_b.title, "Sales Report v2");
  assert.equal(comparison.differences.title_changed, true);
  assert.equal(comparison.differences.section_count_delta, 1);
  assert.deepEqual(comparison.differences.added_section_keys, ["appendix"]);
  assert.deepEqual(comparison.differences.changed_section_titles, ["executive-summary"]);
  assert.deepEqual(comparison.differences.compilation_ids_b, ["compilation-1"]);
});
