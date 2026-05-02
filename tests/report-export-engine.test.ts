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

test("renderReportHtml includes sections, figures, appendices, and audit note", () => {
  const html = renderReportHtml(payload);

  assert.match(html, /Quarterly Sales Performance Report/);
  assert.match(html, /Executive Summary/);
  assert.match(html, /Sales reached 1200/);
  // Check for figure rendering instead of old flat charts section
  assert.match(html, /report-figure/);
  assert.match(html, /Figure 2: Sales by Region/);
  assert.match(html, /Appendices/);
  assert.match(html, /Audit Note/);
});

test("renderReportHtml respects appendix and audit export options", () => {
  const html = renderReportHtml(payload, {
    include_appendix: false,
    include_audit_note: false,
  });

  assert.doesNotMatch(html, /Appendices/);
  assert.doesNotMatch(html, /Audit Note/);
});

test("renderReportText produces a readable report body", () => {
  const text = renderReportText(payload);

  assert.match(text, /TABLE OF CONTENTS/);
  assert.match(text, /1\. Executive Summary/);
  assert.match(text, /• Sales reached 1200\./);
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
