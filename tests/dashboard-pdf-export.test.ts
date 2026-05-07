import assert from "node:assert/strict";
import test from "node:test";
import { renderDashboardPdfHtml } from "../lib/reports/dashboardPdfHtml.ts";
import { topNWithOthers } from "../lib/reports/topNOthers.ts";

test("topNWithOthers returns top rows and an Others aggregate", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    region: `Region ${index + 1}`,
    sales: 120 - index,
    count: 1,
  }));

  const result = topNWithOthers(rows, "sales", "region", 10);

  assert.equal(result.length, 11);
  assert.equal(result[0].region, "Region 1");
  assert.equal(result[9].region, "Region 10");
  assert.deepEqual(result[10], {
    region: "Others",
    sales: 219,
    count: 2,
  });
});

test("topNWithOthers preserves rows when the primary metric is missing", () => {
  const rows = [
    { region: "North", total: 10 },
    { region: "South", total: 8 },
    { region: "East", total: 5 },
  ];

  assert.deepEqual(topNWithOthers(rows, "sales", "region", 2), rows);
});

test("renderDashboardPdfHtml preserves grid placement and summarizes filters", () => {
  const html = renderDashboardPdfHtml({
    header: {
      title: "Sales Dashboard",
      permissionLabel: "Public",
      publishedDate: "5/7/2026",
      generatedDate: "5/7/2026",
    },
    activeFilters: [{ label: "region", values: "North" }],
    blocks: [
      {
        id: "text-1",
        type: "text",
        x: 0,
        y: 0,
        w: 6,
        h: 4,
        content: '<p onclick="bad()">Safe <strong>note</strong></p><script>bad()</script>',
      },
      {
        id: "widget-1",
        type: "widget",
        x: 6,
        y: 0,
        w: 6,
        h: 14,
        title: "Sales by Region",
        chartType: "bar",
        figure: {
          query_output: {
            x_key: "region",
            y_keys: ["sales"],
            columns: ["region", "sales"],
            rows: [{ region: "North", sales: 1200 }],
          },
        },
      },
    ],
  });

  assert.match(html, /Sales Dashboard/);
  assert.match(html, /region: North/);
  assert.match(html, /grid-column:1\/span 6;grid-row:1\/span 4/);
  assert.match(html, /grid-column:7\/span 6;grid-row:1\/span 14/);
  assert.match(html, /<strong>note<\/strong>/);
  assert.doesNotMatch(html, /onclick/);
  assert.doesNotMatch(html, /<script>/);
});

test("renderDashboardPdfHtml splits tall dashboards into normalized page grids", () => {
  const html = renderDashboardPdfHtml({
    header: {
      title: "Operations Dashboard",
      permissionLabel: "Private",
      publishedDate: "5/7/2026",
      generatedDate: "5/7/2026",
    },
    blocks: [
      { id: "a", type: "text", x: 0, y: 0, w: 12, h: 4, content: "First" },
      { id: "b", type: "text", x: 0, y: 42, w: 12, h: 4, content: "Second" },
    ],
  });

  assert.equal((html.match(/class="page"/g) ?? []).length, 2);
  assert.match(html, /Operations Dashboard \(continued\)/);
  assert.match(html, /grid-column:1\/span 12;grid-row:1\/span 4"><p>Second<\/p>/);
});
