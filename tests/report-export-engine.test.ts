import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactMetadata,
  renderReportDocx,
  renderReportHtml,
  renderReportHtmlArtifact,
  renderReportPdf,
  renderReportText,
  sanitizeFilename,
} from "../lib/reports/exportEngineCore.ts";
import { renderPreviewHtml } from "../lib/reports/previewRenderer.ts";

const payload = {
  title: "Quarterly Sales Performance Report",
  metadata: {
    report_project_id: "project-1",
    section_count: 2,
  },
  scope: {
    source_type: "dashboard",
    source_id: "dashboard-1",
    active_filters: { filters: { region: ["North"] } },
  },
  source_note: "Source snapshot snapshot-1 was captured from dashboard dashboard-1.",
  sections: [
    {
      title: "Executive Summary",
      content_markdown: "## Highlights\n- Sales reached 1200.\n- North led performance. {{FIGURE:1}}",
      embedded_figures: [],
    },
    {
      title: "Regional Analysis",
      content_markdown: "Regional performance was strongest in North. {{FIGURE:2}}",
      embedded_figures: [
        {
          figure_number: 2,
          widget_id: "widget-1",
          title: "Sales by Region",
          widget_type: "bar",
          visual_config: { chartType: "bar" },
          query_output: {
            x_key: "region",
            y_keys: ["sales"],
            columns: ["region", "sales"],
            rows: [{ region: "North", sales: 1200 }],
          },
        },
      ],
    },
  ],
  charts: [
    {
      widget_id: "widget-1",
      title: "Sales by Region",
      source_data_table: { rows: [{ region: "North", sales: 1200 }] },
    },
  ],
  appendices: [
    {
      title: "Source Filters",
      type: "source_filters",
      content: { filters: { region: ["North"] } },
    },
  ],
  audit_note: {
    source_dashboard_id: "dashboard-1",
    source_snapshot_id: "snapshot-1",
  },
};

test("artifactMetadata sanitizes filenames and maps MIME types", () => {
  assert.equal(sanitizeFilename("Quarterly Sales / Performance Report!"), "quarterly-sales-performance-report");
  assert.deepEqual(artifactMetadata("html", payload.title), {
    filename: "quarterly-sales-performance-report.html",
    contentType: "text/html; charset=utf-8",
    extension: "html",
  });
});

test("renderReportHtml includes consumer-facing sections and figures", () => {
  const html = renderReportHtml(payload);

  assert.match(html, /Quarterly Sales Performance Report/);
  assert.match(html, /Executive Summary/);
  assert.match(html, /Sales reached 1200/);
  // Check for figure rendering instead of old flat charts section
  assert.match(html, /report-figure/);
  assert.match(html, /Figure 2: Sales by Region/);
  assert.doesNotMatch(html, /Report Metadata/);
  assert.doesNotMatch(html, /Scope And Filters/);
  assert.doesNotMatch(html, /Source snapshot/);
  assert.doesNotMatch(html, /Appendices/);
  assert.doesNotMatch(html, /Audit Note/);
});

test("renderReportHtml omits technical appendix and audit blocks for normal readers", () => {
  const html = renderReportHtml(payload, {
    include_appendix: true,
    include_audit_note: true,
  });

  assert.doesNotMatch(html, /Report Metadata/);
  assert.doesNotMatch(html, /Scope And Filters/);
  assert.doesNotMatch(html, /Appendices/);
  assert.doesNotMatch(html, /Audit Note/);
});

test("renderReportText produces a readable report body", () => {
  const text = renderReportText(payload);

  assert.match(text, /TABLE OF CONTENTS/);
  assert.match(text, /1\. Executive Summary/);
  assert.match(text, /• Sales reached 1200\./);
  assert.doesNotMatch(text, /REPORT METADATA/);
  assert.doesNotMatch(text, /SCOPE AND FILTERS/);
  assert.doesNotMatch(text, /AUDIT NOTE/);
});

test("renderReportDocx returns a DOCX zip payload", async () => {
  const docx = await renderReportDocx(payload);

  assert.equal(docx[0], 0x50);
  assert.equal(docx[1], 0x4b);
  assert.ok(docx.length > 500);
});

test("renderReportPdf returns a PDF payload", async () => {
  const pdf = await renderReportPdf(payload);
  const header = new TextDecoder().decode(pdf.slice(0, 8));

  assert.equal(header, "%PDF-1.4");
  assert.ok(pdf.length > 500);
});

test("renderReportHtmlArtifact encodes HTML bytes", () => {
  const bytes = renderReportHtmlArtifact(payload);
  const html = new TextDecoder().decode(bytes);

  assert.match(html, /^<!doctype html>/);
});

test("renderPreviewHtml renders figures as SVG markup instead of escaped text", () => {
  const html = renderPreviewHtml(payload);

  assert.match(html, /<figure class="report-fig">/);
  assert.match(html, /<svg viewBox=/);
  assert.doesNotMatch(html, /&lt;rect/);
  assert.equal((html.match(/Table of Contents/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Report Metadata/);
  assert.doesNotMatch(html, /Scope &amp; Filters/);
  assert.doesNotMatch(html, /Source snapshot/);
});

test("renderPreviewHtml summarizes large chart datasets into top 10 plus Others", () => {
  const largePayload = structuredClone(payload);
  const rows = Array.from({ length: 12 }, (_, index) => ({
    region: `Region ${index + 1}`,
    sales: 120 - index,
  }));
  largePayload.sections[1].embedded_figures[0].query_output.rows = rows;

  const html = renderPreviewHtml(largePayload);

  assert.match(html, /Region 1/);
  assert.match(html, /Region 10/);
  assert.match(html, /Others/);
  assert.doesNotMatch(html, /Region 11/);
  assert.doesNotMatch(html, /Region 12/);
});

test("rendered report markdown does not leak literal asterisks", () => {
  const markdownPayload = structuredClone(payload);
  markdownPayload.sections[0].content_markdown = "**Executive finding:** Spending is *materially* ahead of plan.";

  const preview = renderPreviewHtml(markdownPayload);
  const html = renderReportHtml(markdownPayload);

  assert.match(preview, /<strong>Executive finding:<\/strong>/);
  assert.match(preview, /<em>materially<\/em>/);
  assert.doesNotMatch(preview, /\*\*/);
  assert.doesNotMatch(html, /\*\*/);
});

test("chart legends reserve space and avoid overlapping chart labels", () => {
  const chartPayload = structuredClone(payload);
  chartPayload.sections[1].embedded_figures[0].query_output.y_keys = [
    "Total Appropriation",
    "Amount Spent (Utilized)",
    "Amount Released (Current Year)",
  ];
  chartPayload.sections[1].embedded_figures[0].query_output.columns = [
    "region",
    "Total Appropriation",
    "Amount Spent (Utilized)",
    "Amount Released (Current Year)",
  ];
  chartPayload.sections[1].embedded_figures[0].query_output.rows = Array.from({ length: 10 }, (_, index) => ({
    region: `Federal Ministry ${index + 1}`,
    "Total Appropriation": 1000 - index * 40,
    "Amount Spent (Utilized)": 400 - index * 20,
    "Amount Released (Current Year)": 600 - index * 25,
  }));

  const preview = renderPreviewHtml(chartPayload);
  const html = renderReportHtml(chartPayload);

  assert.match(preview, /rotate\(-35/);
  assert.match(preview, /Amount Released \(Current Year\)/);
  assert.match(html, /rotate\(-35/);
});

test("pie chart legend is placed in reserved right-side chart space", () => {
  const piePayload = structuredClone(payload);
  piePayload.sections[1].embedded_figures[0].visual_config.chartType = "pie";
  piePayload.sections[1].embedded_figures[0].query_output.rows = Array.from({ length: 10 }, (_, index) => ({
    region: `Federal Ministry of Long Name ${index + 1}`,
    sales: 100 - index * 5,
  }));

  const preview = renderPreviewHtml(piePayload);
  const html = renderReportHtml(piePayload);

  assert.match(preview, /viewBox="0 0 640 360"/);
  assert.match(preview, /<rect x="340"/);
  assert.doesNotMatch(preview, /x="260"/);
  assert.match(html, /viewBox="0 0 640 360"/);
  assert.match(html, /<rect x="340"/);
});

test("bar charts render y-axis tick labels and gridlines", () => {
  const chartPayload = structuredClone(payload);
  chartPayload.sections[1].embedded_figures[0].query_output.rows = [
    { region: "North", sales: 1200 },
    { region: "South", sales: 600 },
  ];

  const preview = renderPreviewHtml(chartPayload);
  const html = renderReportHtml(chartPayload);

  assert.match(preview, /text-anchor="end" font-size="9" fill="#64748b">1\.2K<\/text>/);
  assert.match(preview, /stroke="#edf2f7"/);
  assert.match(html, /text-anchor="end" font-size="9" fill="#64748b">1\.2K<\/text>/);
  assert.match(html, /stroke="#edf2f7"/);
});

test("line charts render y-axis tick labels", () => {
  const linePayload = structuredClone(payload);
  linePayload.sections[1].embedded_figures[0].visual_config.chartType = "line";
  linePayload.sections[1].embedded_figures[0].query_output.rows = [
    { region: "Q1", sales: 100 },
    { region: "Q2", sales: 200 },
  ];

  const preview = renderPreviewHtml(linePayload);
  const html = renderReportHtml(linePayload);

  assert.match(preview, /fill="#64748b">200<\/text>/);
  assert.match(html, /fill="#64748b">200<\/text>/);
});
