import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSectionInputPackage,
  buildSectionSystemPrompt,
  parseGeneratedSection,
  validateSectionReferences,
} from "../lib/reports/sectionGeneratorCore.ts";

const section = {
  id: "section-1",
  report_project_id: "project-1",
  report_blueprint_id: "blueprint-1",
  section_key: "sales-region",
  title: "Sales by Region",
  section_type: "chart_analysis",
  order_index: 1,
  source_widget_ids: ["widget-1"],
  source_worksheet_ids: ["worksheet-1"],
  source_insight_ids: ["insight-1"],
  section_prompt: "Explain regional sales performance.",
  section_config: { narrativeDepth: "standard" },
  metadata: {},
  status: "pending",
};

const blueprint = {
  id: "blueprint-1",
  report_project_id: "project-1",
  status: "approved",
  title: "Monthly Sales Report",
  objective: "Summarize sales performance.",
  audience: "Leadership",
  blueprint_json: {},
};

const snapshot = {
  id: "snapshot-1",
  active_filters_snapshot: { region: ["North"] },
  widgets_snapshot: [
    { id: "widget-1", title: "Regional Sales", worksheet_id: "worksheet-1" },
    { id: "widget-2", title: "Unlinked Widget", worksheet_id: "worksheet-2" },
  ],
  worksheets_snapshot: [
    { id: "worksheet-1", name: "Sales Query" },
    { id: "worksheet-2", name: "Other Query" },
  ],
  insights_snapshot: [
    { id: "insight-1", text: "North is ahead of target." },
    { id: "insight-2", text: "Unlinked insight." },
  ],
  query_outputs_snapshot: {
    "widget-1": { rows: [{ region: "North", sales: 1200 }] },
    "widget-2": { rows: [{ region: "South", sales: 900 }] },
  },
  metadata: { source: { type: "dashboard", id: "dashboard-1" } },
  created_at: "2026-05-02T10:00:00.000Z",
};

test("system prompt forbids invented figures and requires JSON output", () => {
  const prompt = buildSectionSystemPrompt();

  assert.match(prompt, /Do not invent figures/);
  assert.match(prompt, /Use exact figures only/);
  assert.match(prompt, /Focus on the insight/);
  assert.match(prompt, /Do not explain worksheet setup, aggregation functions, query mechanics/);
  assert.match(prompt, /Respond with ONLY a JSON object/);
});

test("buildSectionInputPackage includes only linked source records and query outputs", () => {
  const inputPackage = buildSectionInputPackage(section, blueprint, snapshot, {
    instructions: "Keep this brief.",
  }) as Record<string, Record<string, unknown>>;

  assert.deepEqual(inputPackage.report, {
    title: "Monthly Sales Report",
    objective: "Summarize sales performance.",
    audience: "Leadership",
    blueprint_status: "approved",
  });
  assert.equal((inputPackage.section as Record<string, unknown>).user_instructions, "Keep this brief.");
  assert.deepEqual((inputPackage.source_snapshot as Record<string, unknown>).active_filters, { region: ["North"] });
  const sourceData = inputPackage.source_data as unknown as { widgets: Record<string, unknown>[]; worksheets: Record<string, unknown>[]; insights: Record<string, unknown>[]; query_outputs: Record<string, unknown> };
  assert.deepEqual(sourceData.widgets.map((widget: Record<string, unknown>) => widget.id), ["widget-1"]);
  assert.deepEqual(sourceData.worksheets.map((worksheet: Record<string, unknown>) => worksheet.id), ["worksheet-1"]);
  assert.deepEqual(sourceData.insights.map((insight: Record<string, unknown>) => insight.id), ["insight-1"]);
  assert.deepEqual(Object.keys(sourceData.query_outputs), ["widget-1"]);
});

test("parseGeneratedSection accepts fenced JSON and normalizes optional arrays", () => {
  const output = parseGeneratedSection(
    `\`\`\`json
{
  "title": "",
  "content_markdown": "  Sales increased in the North region.  ",
  "key_findings": ["North sales were 1200.", 42, ""],
  "recommendations": ["Monitor regional mix."],
  "source_references": [
    { "widget_id": "widget-1", "worksheet_id": "worksheet-1", "insight_id": "insight-1" }
  ],
  "warnings": ["Sample size is limited.", null]
}
\`\`\``,
    "Fallback Title"
  );

  assert.equal(output.title, "Fallback Title");
  assert.equal(output.content_markdown, "Sales increased in the North region.");
  assert.deepEqual(output.key_findings, ["North sales were 1200."]);
  assert.deepEqual(output.recommendations, ["Monitor regional mix."]);
  assert.deepEqual(output.warnings, ["Sample size is limited."]);
  assert.deepEqual(output.source_references, [
    { widget_id: "widget-1", worksheet_id: "worksheet-1", insight_id: "insight-1" },
  ]);
});

test("parseGeneratedSection rejects empty generated content", () => {
  assert.throws(
    () => parseGeneratedSection('{"title":"Empty","content_markdown":"   "}', "Fallback"),
    /AI returned empty section content/
  );
});

test("validateSectionReferences warns about unlinked AI source references", () => {
  const warnings = validateSectionReferences(
    {
      title: "Sales by Region",
      content_markdown: "Supported content.",
      key_findings: [],
      recommendations: [],
      source_references: [
        { widget_id: "widget-1", worksheet_id: "worksheet-1", insight_id: "insight-1" },
        { widget_id: "widget-99", worksheet_id: "worksheet-99", insight_id: "insight-99" },
      ],
      warnings: [],
    },
    section
  );

  assert.deepEqual(warnings, [
    "AI referenced unlinked widget widget-99; reference should be reviewed.",
    "AI referenced unlinked worksheet worksheet-99; reference should be reviewed.",
    "AI referenced unlinked insight insight-99; reference should be reviewed.",
  ]);
});
