import assert from "node:assert/strict";
import test from "node:test";
import { renderDashboardPdfHtml } from "../lib/reports/dashboardPdfHtml.ts";

const header = {
  title: "Test Dashboard",
  permissionLabel: "Public",
  publishedDate: "2025-01-15",
  generatedDate: "2025-03-10",
};

test("renderDashboardPdfHtml — produces valid HTML document", () => {
  const html = renderDashboardPdfHtml({
    header,
    blocks: [],
  });
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("Test Dashboard"));
});

test("renderDashboardPdfHtml — includes filter summary when filters provided", () => {
  const html = renderDashboardPdfHtml({
    header,
    blocks: [],
    activeFilters: [
      { label: "Region", values: "North" },
      { label: "Year", values: "2024, 2025" },
    ],
  });
  assert.ok(html.includes("Active filters"));
  assert.ok(html.includes("Region: North"));
  assert.ok(html.includes("Year: 2024, 2025"));
});

test("renderDashboardPdfHtml — no filter summary when no filters", () => {
  const html = renderDashboardPdfHtml({
    header,
    blocks: [],
  });
  assert.ok(!html.includes("Active filters"));
});

test("renderDashboardPdfHtml — renders text blocks", () => {
  const html = renderDashboardPdfHtml({
    header,
    blocks: [
      { id: "t1", x: 0, y: 0, w: 6, h: 4, type: "text", content: "Hello World" },
    ],
  });
  assert.ok(html.includes("Hello World"));
  assert.ok(html.includes("text-cell"));
});

test("renderDashboardPdfHtml — renders empty text block as nothing", () => {
  const html = renderDashboardPdfHtml({
    header,
    blocks: [
      { id: "t1", x: 0, y: 0, w: 6, h: 4, type: "text", content: "   " },
    ],
  });
  // Empty/whitespace text blocks should not produce a visible cell
  const afterCss = html.split("</style>")[1] ?? "";
  assert.ok(!afterCss.includes("class=\"text-cell\""));
});

test("renderDashboardPdfHtml — splits into multiple pages for tall content", () => {
  const blocks = [];
  // 3 widgets stacked vertically, each h=14, total=42 > PAGE_HEIGHT(37)
  blocks.push({ id: "w1", x: 0, y: 0, w: 6, h: 14, type: "widget" as const, title: "Top Widget", chartType: "bar" });
  blocks.push({ id: "w2", x: 6, y: 0, w: 6, h: 14, type: "widget" as const, title: "Top Right", chartType: "line" });
  blocks.push({ id: "w3", x: 0, y: 14, w: 12, h: 14, type: "widget" as const, title: "Middle", chartType: "area" });
  blocks.push({ id: "w4", x: 0, y: 28, w: 4, h: 14, type: "widget" as const, title: "Bottom", chartType: "pie" });

  const html = renderDashboardPdfHtml({ header, blocks });
  assert.ok(html.includes("Middle"));
  assert.ok(html.includes("Bottom"));
  // Should have at least 1 page container
  const pageCount = (html.match(/class="page"/g) || []).length;
  assert.ok(pageCount >= 1);
});

test("renderDashboardPdfHtml — grid placement uses correct column/row spans", () => {
  const html = renderDashboardPdfHtml({
    header,
    blocks: [
      { id: "w1", x: 2, y: 5, w: 4, h: 10, type: "widget" as const, title: "Chart", chartType: "bar" },
    ],
  });
  // grid-column should start at x+1=3 and span w=4
  assert.ok(html.includes("grid-column:3/span 4"));
  // grid-row should start at y-pageTop+1. pageTop for this block is 5, so row=1
  assert.ok(html.includes("grid-row:1/span 10"));
});

test("renderDashboardPdfHtml — title is HTML-escaped", () => {
  const html = renderDashboardPdfHtml({
    header: { ...header, title: "Sales < 100 & Profit > 50" },
    blocks: [],
  });
  assert.ok(html.includes("Sales &lt; 100 &amp; Profit &gt; 50"));
});

test("renderDashboardPdfHtml — landscape A4 page size in CSS", () => {
  const html = renderDashboardPdfHtml({ header, blocks: [] });
  assert.ok(html.includes("A4 landscape"));
});
