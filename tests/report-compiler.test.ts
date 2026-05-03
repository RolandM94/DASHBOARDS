import assert from "node:assert/strict";
import test from "node:test";
import { buildCompiledReportPayload } from "../lib/reports/reportCompilerCore.ts";

const project = {
  id: "project-1",
  name: "Quarterly Sales Report",
  description: "A leadership-ready sales report.",
  source_type: "dashboard" as const,
  source_dashboard_id: "dashboard-1",
  source_canvas_id: null,
  report_type: "management_report",
  status: "generated",
  created_by: "user-1",
  created_at: "2026-05-01T09:00:00.000Z",
  updated_at: "2026-05-01T09:00:00.000Z",
};

const blueprint = {
  id: "blueprint-1",
  report_project_id: "project-1",
  version: 1,
  status: "approved",
  title: "Quarterly Sales Performance Report",
  objective: "Summarize quarterly sales performance and highlight key trends.",
  audience: "VP of Sales and regional managers",
  blueprint_json: {},
  generated_by_ai: true,
  approved_by: null,
  approved_at: null,
  created_at: "2026-05-01T09:05:00.000Z",
  updated_at: "2026-05-01T09:05:00.000Z",
};

const sections = [
  {
    id: "section-2",
    report_project_id: "project-1",
    report_blueprint_id: "blueprint-1",
    parent_section_id: null,
    section_key: "regional-analysis",
    title: "Regional Analysis",
    section_type: "chart_analysis",
    order_index: 2,
    source_widget_ids: ["widget-1"],
    source_worksheet_ids: ["worksheet-1"],
    source_insight_ids: [],
    section_prompt: null,
    section_config: {},
    status: "edited",
    generated_content: "Generated regional analysis.",
    edited_content: "Edited regional analysis.",
    metadata: {
      generated_output: {
        source_references: [{ widget_id: "widget-1", worksheet_id: "worksheet-1" }],
        warnings: ["Regional sample is partial."],
        generated_at: "2026-05-01T10:00:00.000Z",
        model: "test-model",
      },
    },
    created_at: "2026-05-01T09:10:00.000Z",
    updated_at: "2026-05-01T10:30:00.000Z",
  },
  {
    id: "section-1",
    report_project_id: "project-1",
    report_blueprint_id: "blueprint-1",
    parent_section_id: null,
    section_key: "executive-summary",
    title: "Executive Summary",
    section_type: "executive_summary",
    order_index: 1,
    source_widget_ids: [],
    source_worksheet_ids: [],
    source_insight_ids: [],
    section_prompt: null,
    section_config: {},
    status: "generated",
    generated_content: "Generated executive summary.",
    edited_content: null,
    metadata: {},
    created_at: "2026-05-01T09:05:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
  },
];

const snapshot = {
  id: "snapshot-1",
  report_project_id: "project-1",
  source_type: "dashboard" as const,
  source_id: "dashboard-1",
  active_filters_snapshot: { filters: { region: ["North"] }, smart_filters: ["top-performers"] },
  widgets_snapshot: [
    {
      id: "widget-1",
      title: "Sales by Region",
      type: "bar",
      worksheet_id: "worksheet-1",
      visual_config: { chartType: "bar" },
    },
  ],
  worksheets_snapshot: [
    { id: "worksheet-1", name: "Sales Query", config: { metrics: ["sales"] } },
  ],
  insights_snapshot: [],
  query_outputs_snapshot: {
    "widget-1": {
      columns: ["region", "sales"],
      rows: [{ region: "North", sales: 1200 }],
    },
  },
  metadata: {
    source: { type: "dashboard", id: "dashboard-1", title: "Sales Dashboard" },
    warnings: [{ message: "One widget had limited rows." }],
  },
  created_at: "2026-05-01T09:30:00.000Z",
};

test("buildCompiledReportPayload orders sections and prefers edited content", () => {
  const payload = buildCompiledReportPayload(project, blueprint, sections, snapshot);

  assert.equal(payload.title, "Quarterly Sales Performance Report");
  assert.deepEqual(payload.table_of_contents.map((item) => item.section_key), [
    "executive-summary",
    "regional-analysis",
  ]);
  assert.deepEqual(payload.sections.map((section) => section.title), [
    "Executive Summary",
    "Regional Analysis",
  ]);
  assert.equal(payload.sections[1].content_markdown, "Edited regional analysis.");
  assert.deepEqual(payload.sections[1].source_references, [
    { widget_id: "widget-1", worksheet_id: "worksheet-1", insight_id: undefined },
  ]);
});

test("buildCompiledReportPayload includes source scope, audit note, and chart placeholders", () => {
  const payload = buildCompiledReportPayload(project, blueprint, sections, snapshot);

  assert.equal(payload.scope.source_id, "dashboard-1");
  assert.deepEqual(payload.scope.active_filters, snapshot.active_filters_snapshot);
  assert.equal(payload.audit_note.source_dashboard_id, "dashboard-1");
  assert.equal(payload.audit_note.source_snapshot_id, "snapshot-1");
  assert.equal(payload.charts.length, 1);
  assert.equal(payload.charts[0].chart_image_placeholder, true);
  assert.deepEqual(payload.charts[0].source_data_table, snapshot.query_outputs_snapshot["widget-1"]);
});

test("buildCompiledReportPayload includes appendices by default and can omit them", () => {
  const withAppendices = buildCompiledReportPayload(project, blueprint, sections, snapshot);
  const withoutAppendices = buildCompiledReportPayload(project, blueprint, sections, snapshot, {
    includeAppendices: false,
  });

  assert.deepEqual(withAppendices.appendices.map((appendix) => appendix.type), [
    "source_filters",
    "widget_data_tables",
    "worksheet_configurations",
    "data_quality_warnings",
    "section_generation_notes",
  ]);
  assert.deepEqual(withoutAppendices.appendices, []);
});

test("buildCompiledReportPayload warns when a section has no content", () => {
  const payload = buildCompiledReportPayload(project, blueprint, [
    {
      ...sections[0],
      title: "Empty Section",
      generated_content: "   ",
      edited_content: null,
    },
  ], snapshot);

  assert.deepEqual(payload.warnings, ['Section "Empty Section" has no generated or edited content.']);
});
