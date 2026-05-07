# Plan: Professional PDF Export for Published Dashboards

## Goal

Replace `window.print()` with a **server-side PDF pipeline** that mirrors the live
dashboard's 12-column grid layout, handles page breaks cleanly, and applies
"top 10 + others" aggregation for large widgets.

**Decisions:**
- Landscape A4 (fits the 12-column grid)
- Standalone SVG chart renderer (`lib/reports/chartRenderer.ts`, same as reports)

---

## Architecture

```
Export PDF button click
  → GET /api/dashboards/[id]/pdf
    → loadDashboardScope()          (reuse existing — permission-aware)
    → fetch aggregate data for ALL widget blocks in parallel
    → apply top-10 + others per widget (where > 10 data points)
    → generate HTML document via dashboardPdfHtml()
    → chromium.launch()             (reuse Playwright pattern from exportEngineCore.ts)
    → page.setContent(html)
    → page.pdf({ format: "A4", landscape: true, ... })
    → return PDF bytes
  ← browser downloads PDF blob
```

---

## Chunk 1 — Top N + Others aggregation utility

**New file:** `lib/reports/topNOthers.ts`

```ts
type DataRow = Record<string, string | number>;

function topNWithOthers(
  rows: DataRow[],
  metricKey: string,
  dimensionKey: string,
  n?: number
): DataRow[]
```

**Logic:**

1. If `rows.length <= n`, return as-is
2. Sort rows by `metricKey` descending
3. Take `rows.slice(0, n)` as top entries
4. Sum the `metricKey` values of `rows.slice(n)` — that's the "Others" sum
5. Create one "Others" row with `dimensionKey: "Others"` and the summed metric
6. Return `[...topN, othersRow]`

Other numeric metrics beyond the primary sort metric are summed for the "Others"
row. Non-numeric dimension values use the first top entry's value.

**Edge cases:**
- `n` is 0 or negative → return all rows unchanged
- `metricKey` doesn't exist → return all rows unchanged
- All rows have `null`/`0` values → return top N + "Others" with 0
- `rows` is null/empty → return empty array

---

## Chunk 2 — Dashboard PDF HTML template

**New file:** `lib/reports/dashboardPdfHtml.ts`

### Input shape

```ts
interface DashboardPdfInput {
  dashboard: {
    title: string;
    permission: string;
    publishedAt: string;
  };
  blocks: Array<{
    layout: { x: number; y: number; w: number; h: number };
    type: "widget" | "text" | "preview" | "filter";
    // widget-specific
    title?: string;
    chartData?: ResolvedChartData | null;
    chartType?: string;
    logScale?: boolean;
    // text-specific
    content?: string;
    // preview-specific
    previewRows?: Record<string, unknown>[];
    columns?: string[];
  }>;
}
```

### Layout system

Uses **CSS Grid** with explicit placement matching `react-grid-layout` positions:

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 10px;
  grid-auto-rows: 18px;
  width: 100%;
}

.widget-cell {
  grid-column: X+1 / span W;
  grid-row: Y+1 / span H;
  page-break-inside: avoid;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  background: white;
}

.text-cell {
  grid-column: X+1 / span W;
  grid-row: Y+1 / span H;
  page-break-inside: avoid;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: white;
  font-size: 13px;
  line-height: 1.6;
}

.page-break-spacer {
  grid-column: 1 / -1;
  page-break-after: always;
  height: 0;
}
```

- Grid row height: 18px per unit (maps `h: 14 → 252px` in the grid)
- `X`, `Y`, `W`, `H` from `GridLayoutItem` positions
- After every ~3 visual rows (cumulative height), inject a `page-break-spacer`

### Widget chart rendering

Calls the existing chart renderer from `lib/reports/chartRenderer.ts`:

| Chart Type | SVG Function | Notes |
|---|---|---|
| bar | `svgBar(data, { width, height, ... })` | Vertical bars |
| line | `svgLine(data, { width, height, ... })` | Line chart with dots |
| area | `svgArea(data, { width, height, ... })` | Area chart |
| pie | `svgPie(data, { width, height, ... })` | Pie/donut |
| kpi | Custom KPI HTML card | Big number + label + delta |
| table | HTML `<table>` | Max 15 rows visible, scrollable |

Chart dimensions are calculated from the widget's `w` and `h` to fill the cell.

### Text block rendering

```html
<div class="text-cell">
  <!-- Rich text content, sanitized, rendered as HTML -->
  {content}
</div>
```

Styled with system font stack, 13px text.

### Dataset preview block rendering

```html
<div class="widget-cell">
  <table class="preview-table">
    <thead><tr>{columns}</tr></thead>
    <tbody>{rows (max 15)}</tbody>
  </table>
</div>
```

### Filter blocks

Skipped entirely — filter blocks are interactive UI, not meaningful in a static PDF.

### Header (per page)

Playwright header template with dashboard title:
```html
<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:left;">
  {dashboard.title}
</div>
```

### Footer (per page)

Playwright footer template with page numbers:
```html
<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:right;">
  Page <span class="pageNumber"></span> of <span class="totalPages"></span>
</div>
```

### First-page intro section

Before the grid, render a header block:
- Dashboard title (large, bold)
- Permission badge (Private / Organisation / Public)
- Published date
- Generation timestamp

This section appears once at the top, not repeated.

---

## Chunk 3 — PDF generation API endpoint

**New file:** `app/api/dashboards/[id]/pdf/route.ts`

### Route: `GET /api/dashboards/[id]/pdf`

```ts
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
)
```

### Steps

#### 1. Auth & dashboard scope

```ts
const supabase = await createClient();
const serviceClient = await createServiceClient();
const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, id);
if (!scope) return NextResponse.json({ error }, { status });
```

Reuses existing `loadDashboardScope` — permission-aware (public dashboards work without auth, private/org enforced by RLS).

#### 2. Fetch aggregate data for all widget blocks in parallel

```ts
const widgetBlocks = scope.dashboard.blocks.filter(
  (b: CanvasBlock): b is WidgetBlockConfig => b.type === "widget"
);

const aggregatePromises = widgetBlocks.map(async (block) => {
  const ws = scope.worksheets.find(w => w.id === block.worksheetId);
  if (!ws) return { blockId: block.id, data: null, chartType: null };

  const sheet = getWorkbookSheet(ws, block.sheetId);
  if (!sheet) return { blockId: block.id, data: null, chartType: null };

  const { data, error } = await serviceClient.rpc("aggregate_dataset", {
    p_dataset_id: ws.dataset_id,
    p_dimensions: sheet.dimensions,
    p_metrics: sheet.metrics,
    p_worksheet_filters: sheet.filters ?? [],
    p_global_filters: {},
    p_smart_filter_conditions: [],
    p_sort: sheet.sort ?? "natural",
  });

  return { blockId: block.id, data: error ? null : data, chartType: sheet.chartType };
});

const aggregateResults = await Promise.all(aggregatePromises);
```

Uses `serviceClient` so it works even for unauthenticated public viewers.

#### 3. Apply top-10 + others

For each aggregate result where data exceeds 10 rows:

```ts
const TOP_N = 10;

for (const result of aggregateResults) {
  if (result.data && Array.isArray(result.data) && result.data.length > TOP_N) {
    const block = widgetBlocks.find(b => b.id === result.blockId);
    const ws = block ? scope.worksheets.find(w => w.id === block.worksheetId) : undefined;
    const sheet = ws && block ? getWorkbookSheet(ws, block.sheetId) : null;

    if (sheet && sheet.metrics.length > 0 && sheet.dimensions.length > 0) {
      const primaryMetric = sheet.metrics[0].label;
      const primaryDim = sheet.dimensions[0].label;
      result.data = topNWithOthers(result.data, primaryMetric, primaryDim, TOP_N);
    }
  }
}
```

Applies only when a widget has >10 data points. Uses primary metric + first dimension
for the sort-and-group logic.

#### 4. Build blocks array

Map each dashboard block to the HTML template input shape:

```ts
const blocks = scope.dashboard.blocks.map((block) => {
  const layout = scope.dashboard.layout?.find((l) => l.i === block.id);

  if (block.type === "widget") {
    const agg = aggregateResults.find(r => r.blockId === block.id);
    const chartData = resolveChartData(agg?.data, /* metrics & dimensions */);
    return { layout, type: "widget", title: block.title, chartData, chartType: agg?.chartType, logScale: sheet?.logScale };
  }

  if (block.type === "text") {
    return { layout, type: "text", content: block.content };
  }

  if (block.type === "preview") {
    return { layout, type: "preview", previewRows: /* fetched rows */, columns: /* column names */ };
  }

  // filter — skip
  return null;
}).filter(Boolean);
```

#### 5. Generate HTML + render PDF

```ts
import chromium from "@sparticuz/chromium";
const isLinux = process.platform === "linux";

const html = renderDashboardPdfHtml({ dashboard: scope.dashboard, blocks });
const launchOptions = isLinux
  ? { args: chromium.args, executablePath: await chromium.executablePath(), headless: chromium.headless }
  : { headless: true as const };

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });

  const pdf = await page.pdf({
    format: "A4",
    landscape: true,
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: "16mm", right: "10mm", bottom: "16mm", left: "10mm" },
    headerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:left;">${scope.dashboard.title}</div>`,
    footerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(scope.dashboard.title)}.pdf"`,
    },
  });
} finally {
  await browser.close();
}
```

Same Playwright/Chromium pattern as `lib/reports/exportEngineCore.ts:renderReportPdf()`.

#### Error handling

| Scenario | Status | Response |
|---|---|---|
| Dashboard not found | 404 | `{ error: "Dashboard not found" }` |
| Permission denied | 403 | `{ error: "Permission denied" }` (returned from loadDashboardScope) |
| Chromium launch fails | 500 | `{ error: "PDF generation unavailable" }` |
| All widgets failed | 200 | PDF still generated with dashboard header + empty blocks |
| Timeout (60s exceeded) | 504 | Let Next.js handle with maxDuration |

---

## Chunk 4 — Frontend: replace `window.print()`

**Edit file:** `components/analytics/dashboard/DashboardView.tsx`

### Remove

```tsx
function exportPDF() {
  window.print();
}
```

### Replace with

```tsx
const [exportingPdf, setExportingPdf] = useState(false);

function exportPDF() {
  setExportingPdf(true);
  const anchor = document.createElement("a");
  anchor.href = `/api/dashboards/${dashboard.id}/pdf`;
  anchor.download = `${dashboard.title}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Reset after a short delay (download starts immediately)
  setTimeout(() => setExportingPdf(false), 2000);
}
```

### Update button

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={exportPDF}
  disabled={exportingPdf}
  className="gap-1.5 text-xs h-8 px-2.5 sm:px-3"
>
  {exportingPdf
    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
    : <FileDown className="h-3.5 w-3.5" />
  }
  <span className="hidden sm:inline">
    {exportingPdf ? "Exporting…" : "Export PDF"}
  </span>
</Button>
```

`Loader2` is already imported in this file — no new import needed.

---

## Chunk 5 — Page break logic (in dashboardPdfHtml.ts)

### Algorithm

```
walk blocks sorted by (y, x):
  currentPageHeight = 0
  pageBreakAt = pageHeightInGridUnits  (≈35-40 units for A4 landscape)

  for each block:
    if block.y + block.h would exceed currentPageHeight + pageBreakAt:
      insert page-break-spacer before this block
      currentPageHeight = block.y + block.h
    else:
      currentPageHeight = max(currentPageHeight, block.y + block.h)
```

Page height in grid units:
- A4 landscape: 210mm tall
- Margin: 32mm (16mm × 2)
- Usable height: 178mm
- Grid row: 18px ≈ 4.76mm
- Grid units per page: 178 / 4.76 ≈ **37 units**

So a page ends every ~37 units of cumulative Y + H.

### In the HTML output

```html
<div class="dashboard-grid">
  <!-- Row 0-2 widgets -->
  <div class="widget-cell" style="grid-column: 1 / span 6; grid-row: 1 / span 14;">...</div>
  <div class="widget-cell" style="grid-column: 7 / span 6; grid-row: 1 / span 14;">...</div>

  <!-- PAGE BREAK -->
  <div class="page-break-spacer"></div>

  <!-- Row 3-5 widgets -->
  <div class="widget-cell" style="grid-column: 1 / span 12; grid-row: 15 / span 14;">...</div>
</div>
```

The `page-break-spacer` has `page-break-after: always` and `height: 0`, so it forces
the browser to start a new page at that point without adding visual space.

---

## Chunk 6 — Clean up old print CSS

**Edit file:** `app/globals.css`

Remove or comment out the `@media print` block that overrides `.react-grid-layout`
and `.react-grid-item` positioning. These were hacks to make `window.print()` work
and are no longer needed.

**Keep:**
- `@page { margin: ... }` — harmless fallback
- `html, body { background: white !important; color: black !important; }` — harmless

**Remove/comment:**
```css
/* .react-grid-layout { position: relative !important; ... } */
/* .react-grid-item { position: relative !important; transform: none !important; ... } */
/* svg.recharts-surface { width: 100% !important; } */
```

These were forcing the grid into a single-column vertical stack for print. Since PDF
is now server-rendered and preserves the grid layout, these overrides are obsolete.

---

## Files summary

| # | File | Action | Purpose |
|---|---|---|---|
| 1 | `lib/reports/topNOthers.ts` | **New** | Top N + "Others" aggregation utility |
| 2 | `lib/reports/dashboardPdfHtml.ts` | **New** | HTML template with CSS grid layout, SVG charts |
| 3 | `app/api/dashboards/[id]/pdf/route.ts` | **New** | PDF generation endpoint (Playwright/Chromium) |
| 4 | `components/analytics/dashboard/DashboardView.tsx` | **Edit** | Replace `window.print()`, add export loading state |
| 5 | `app/globals.css` | **Edit** | Remove old `@media print` grid overrides |

No new dependencies — `playwright`, `@sparticuz/chromium`, and chart renderer utilities
already exist in the codebase.

---

## Edge cases

| Scenario | Handling |
|---|---|
| Dashboard with no widgets (all text/filter blocks) | Render text blocks in grid, skip empty widget cells |
| Widget source worksheet deleted | Show "Data source unavailable" placeholder in that cell |
| Aggregate API fails for a widget | Show "Data unavailable" placeholder, continue with other widgets |
| Very large dashboard (30+ widgets) | Multiple pages with page breaks at row boundaries |
| Dashboard title contains special chars | Sanitize filename: replace `[<>:"/\\|?*]` with `-` |
| Chromium cold-start on Vercel | 60s maxDuration gives enough time; if still fails, return 500 |
| Data contains >10 but ≤10 unique dimension values after filtering | Apply top-N only when raw data > 10; filtered data may have ≤10, which is fine |
| KPI widget (single value) | topNWithOthers won't touch it (≤10 rows), renders as KPI card |
| Landscape A4 + very tall widget (h > 37) | Widget starts on new page via `page-break-inside: avoid` |

---

## Execution order

1. `lib/reports/topNOthers.ts` — pure utility, zero dependencies
2. `lib/reports/dashboardPdfHtml.ts` — depends on existing `chartRenderer.ts`
3. `app/api/dashboards/[id]/pdf/route.ts` — depends on 1, 2 + existing scope/chromium
4. `components/analytics/dashboard/DashboardView.tsx` — connect button to API
5. `app/globals.css` — clean old print styles

Tests should be added for `topNOthers.ts` (pure function, easy to unit test) and
`dashboardPdfHtml.ts` (verify HTML output contains correct grid placement).
