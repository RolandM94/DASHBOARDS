import {
  esc, nv, parseChart, parseTable, tableValue, CHART_COLORS, shortLabel,
  axisValue, kpiValue, yAxisTicks, richTextToHtml,
} from "./chartRenderer";

type R = Record<string, unknown>;

// ── Types ─────────────────────────────────────────────────────────────────

interface DashboardHeader {
  title: string;
  permissionLabel: string;
  publishedDate: string;
  generatedDate: string;
}

interface FilterSummary {
  label: string;
  values: string;
}

interface PdfBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "widget" | "text" | "preview";
  title?: string;
  chartType?: string;
  figure?: R;              // query_output shape for svgBar/svgLine/etc.
  logScale?: boolean;
  content?: string;        // text block content
  columns?: string[];      // preview table columns
  previewRows?: R[];       // preview table rows
}

interface Page {
  top: number;
  blocks: PdfBlock[];
}

export interface DashboardPdfInput {
  header: DashboardHeader;
  blocks: PdfBlock[];
  activeFilters?: FilterSummary[];
}

// ── Page splitting ────────────────────────────────────────────────────────

const ROW_HEIGHT = 18;   // px per grid row unit in the PDF
const PAGE_HEIGHT = 37;  // grid units per page (A4 landscape usable height)

function splitPages(blocks: PdfBlock[]): Page[] {
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const pages: Page[] = [];
  let current: Page = { top: 0, blocks: [] };

  for (const block of sorted) {
    const blockBottom = block.y + block.h;
    const pageBottom = current.top + PAGE_HEIGHT;

    if (current.blocks.length > 0 && blockBottom > pageBottom) {
      pages.push(current);
      current = { top: block.y, blocks: [block] };
    } else {
      if (current.blocks.length === 0) current.top = block.y;
      current.blocks.push(block);
    }
  }

  if (current.blocks.length > 0) pages.push(current);
  return pages;
}

// ── Filter summary ────────────────────────────────────────────────────────

function renderFilterSummary(filters?: FilterSummary[]): string {
  if (!filters || filters.length === 0) return "";
  return `
    <div class="filter-summary">
      <span class="filter-label">Active filters:</span>
      ${filters.map((f) =>
        `<span class="filter-chip">${esc(f.label)}: ${esc(f.values)}</span>`
      ).join("")}
    </div>`;
}

// ── Widget SVG ────────────────────────────────────────────────────────────

function renderWidgetSvg(block: PdfBlock, cellW: number, cellH: number): string {
  if (!block.figure) return `<div class="chart-placeholder">Data unavailable</div>`;

  const chartType = (block.chartType ?? "table").toLowerCase();
  const w = Math.max(cellW - 24, 200);
  const h = Math.max(cellH - 36, 140);

  if (chartType.includes("pie")) {
    return svgPie(block.figure, w, h);
  }
  if (chartType === "kpi") {
    return renderKpi(block.figure);
  }
  if (chartType.includes("bar")) {
    return svgBar(block.figure, w, h);
  }
  if (chartType.includes("line")) {
    return svgLine(block.figure, w, h);
  }
  if (chartType.includes("area")) {
    return svgArea(block.figure, w, h);
  }

  // Fallback: table
  const { rows, columns } = parseTable(block.figure.query_output as R);
  const hdrs = columns.slice(0, 8);
  return `<table class="figure-table"><thead><tr>${hdrs.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 50).map((row) =>
    `<tr>${hdrs.map((h) => `<td>${esc(tableValue(row[h]))}</td>`).join("")}</tr>`
  ).join("")}</tbody></table>`;
}

// ── KPI rendering ─────────────────────────────────────────────────────────

function renderKpi(figure: R): string {
  const { rows, yKeys } = parseChart(figure.query_output as R);
  const row = rows[0];
  return `<div class="kpi-grid">${yKeys.map((key, i) => {
    const value = kpiValue(row?.values[i] ?? 0);
    return `<div class="kpi-box"><span class="kpi-label" title="${esc(key)}">${esc(key)}</span><span class="kpi-value">${esc(value.display)}</span></div>`;
  }).join("")}</div>`;
}

// ── SVG renderers (inline, adapted from chartRenderer) ─────────────────────

function svgBar(figure: R, w: number, h: number): string {
  const { rows, yKeys } = parseChart(figure.query_output as R);
  if (rows.length === 0) return `<div class="chart-placeholder">No data</div>`;
  const legendRows = Math.max(1, Math.ceil(yKeys.length / 2));
  const pad = { t: 28, r: 20, b: 100 + legendRows * 16, l: 56 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const mx = Math.max(...rows.flatMap((r) => r.values), 1);
  const groupW = cw / rows.length;
  const barW = Math.max(4, (groupW / yKeys.length) * 0.72);
  const gap = groupW / yKeys.length;

  const axisLines = yAxisTicks(mx, pad, cw, ch);

  let bars = "";
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < yKeys.length; j++) {
      const bh = Math.max(1, (rows[i].values[j] / mx) * ch);
      const x = pad.l + i * groupW + j * gap + (gap - barW) / 2;
      const y = pad.t + ch - bh;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${CHART_COLORS[j % CHART_COLORS.length]}" rx="2"/>`;
    }
  }

  let legend = "";
  for (let j = 0; j < yKeys.length; j++) {
    legend += `<div class="legend-item"><span class="legend-swatch" style="background:${CHART_COLORS[j % CHART_COLORS.length]}"></span>${esc(shortLabel(yKeys[j], 20))}</div>`;
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif">
    ${axisLines}
    ${bars}
  </svg><div class="chart-legend">${legend}</div>`;
}

function svgLine(figure: R, w: number, h: number): string {
  const { rows, yKeys } = parseChart(figure.query_output as R);
  if (rows.length === 0) return `<div class="chart-placeholder">No data</div>`;
  const legendRows = Math.max(1, Math.ceil(yKeys.length / 2));
  const pad = { t: 28, r: 20, b: 100 + legendRows * 16, l: 56 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const mx = Math.max(...rows.flatMap((r) => r.values), 1);

  const axisLines = yAxisTicks(mx, pad, cw, ch);

  let paths = "";
  let dots = "";
  for (let j = 0; j < yKeys.length; j++) {
    const step = rows.length > 1 ? cw / (rows.length - 1) : cw / 2;
    const points = rows.map((r, i) => `${(pad.l + i * step).toFixed(1)},${(pad.t + ch - (r.values[j] / mx) * ch).toFixed(1)}`).join(" ");
    paths += `<polyline points="${points}" fill="none" stroke="${CHART_COLORS[j % CHART_COLORS.length]}" stroke-width="2" stroke-linejoin="round"/>`;
    for (let i = 0; i < rows.length; i++) {
      dots += `<circle cx="${(pad.l + i * step).toFixed(1)}" cy="${(pad.t + ch - (rows[i].values[j] / mx) * ch).toFixed(1)}" r="3" fill="${CHART_COLORS[j % CHART_COLORS.length]}"/>`;
    }
  }

  let legend = "";
  for (let j = 0; j < yKeys.length; j++) {
    legend += `<div class="legend-item"><span class="legend-swatch" style="background:${CHART_COLORS[j % CHART_COLORS.length]}"></span>${esc(shortLabel(yKeys[j], 20))}</div>`;
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif">
    ${axisLines}
    ${paths}${dots}
  </svg><div class="chart-legend">${legend}</div>`;
}

function svgArea(figure: R, w: number, h: number): string {
  const { rows, yKeys } = parseChart(figure.query_output as R);
  if (rows.length === 0) return `<div class="chart-placeholder">No data</div>`;
  const legendRows = Math.max(1, Math.ceil(yKeys.length / 2));
  const pad = { t: 28, r: 20, b: 100 + legendRows * 16, l: 56 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const mx = Math.max(...rows.flatMap((r) => r.values), 1);

  const axisLines = yAxisTicks(mx, pad, cw, ch);

  let areas = "";
  let lines = "";
  let dots = "";
  for (let j = yKeys.length - 1; j >= 0; j--) {
    const step = rows.length > 1 ? cw / (rows.length - 1) : cw / 2;
    const points = rows.map((r, i) => `${(pad.l + i * step).toFixed(1)},${(pad.t + ch - (r.values[j] / mx) * ch).toFixed(1)}`).join(" ");
    areas += `<polygon points="${pad.l.toFixed(1)},${(pad.t + ch).toFixed(1)} ${points} ${(pad.l + (rows.length - 1) * step).toFixed(1)},${(pad.t + ch).toFixed(1)}" fill="${CHART_COLORS[j % CHART_COLORS.length]}" opacity="0.2"/>`;
    lines += `<polyline points="${points}" fill="none" stroke="${CHART_COLORS[j % CHART_COLORS.length]}" stroke-width="2" stroke-linejoin="round"/>`;
    for (let i = 0; i < rows.length; i++) {
      dots += `<circle cx="${(pad.l + i * step).toFixed(1)}" cy="${(pad.t + ch - (rows[i].values[j] / mx) * ch).toFixed(1)}" r="2.5" fill="${CHART_COLORS[j % CHART_COLORS.length]}"/>`;
    }
  }

  let legend = "";
  for (let j = 0; j < yKeys.length; j++) {
    legend += `<div class="legend-item"><span class="legend-swatch" style="background:${CHART_COLORS[j % CHART_COLORS.length]}"></span>${esc(shortLabel(yKeys[j], 20))}</div>`;
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif">
    ${axisLines}
    ${areas}${lines}${dots}
  </svg><div class="chart-legend">${legend}</div>`;
}

function svgPie(figure: R, w: number, h: number): string {
  const { rows } = parseChart(figure.query_output as R);
  if (rows.length === 0) return `<div class="chart-placeholder">No data</div>`;
  const values = rows.map((r) => Math.abs(r.values[0]));
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return `<div class="chart-placeholder">No data</div>`;

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 40;

  let slices = "";
  let start = 0;
  for (let i = 0; i < values.length; i++) {
    const sliceAngle = (values[i] / total) * 2 * Math.PI;
    if (sliceAngle <= 0) continue;
    const x1 = cx + r * Math.sin(start);
    const y1 = cy - r * Math.cos(start);
    const x2 = cx + r * Math.sin(start + sliceAngle);
    const y2 = cy - r * Math.cos(start + sliceAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    slices += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${CHART_COLORS[i % CHART_COLORS.length]}" stroke="white" stroke-width="1.5"/>`;
    start += sliceAngle;
  }

  let legend = "";
  for (let i = 0; i < rows.length; i++) {
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : "0";
    legend += `<div class="legend-item"><span class="legend-swatch" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${esc(shortLabel(rows[i].label, 22))} (${pct}%)</div>`;
  }

  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif">${slices}</svg><div class="chart-legend">${legend}</div>`;
}

// ── Main HTML renderer ────────────────────────────────────────────────────

export function renderDashboardPdfHtml(input: DashboardPdfInput): string {
  const { header, blocks, activeFilters } = input;
  const filterSummary = renderFilterSummary(activeFilters);
  const pages = splitPages(blocks);

  if (pages.length === 0) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(header.title)}</title>
<style>
  @page { size: A4 landscape; margin: 16mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #1f2937;
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }
  .header {
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 2px solid #e5e7eb;
  }
  .dash-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: #111827;
  }
  .dash-meta {
    font-size: 10px;
    color: #6b7280;
  }
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #9ca3af;
    font-size: 14px;
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1 class="dash-title">${esc(header.title)}</h1>
    <div class="dash-meta">${esc(header.permissionLabel)} · Published ${esc(header.publishedDate)} · Generated ${esc(header.generatedDate)}</div>
    ${filterSummary}
  </div>
  <div class="empty-state">This dashboard has no content blocks.</div>
</div>
</body>
</html>`;
  }

  const pageContainers = pages.map((page, pageIdx) => {
    const rows = Math.max(1, Math.max(...page.blocks.map((b) => b.y + b.h - page.top)));
    const gridHtml = page.blocks.map((block) => {
      const gx = block.x + 1;
      const gy = block.y - page.top + 1;
      const gw = block.w;
      const gh = block.h;

      if (block.type === "text") {
        const content = block.content ?? "";
        if (!content.trim()) return "";
        return `<div class="cell text-cell" style="grid-column:${gx}/span ${gw};grid-row:${gy}/span ${gh}">${richTextToHtml(content)}</div>`;
      }

      if (block.type === "preview") {
        const cols = block.columns ?? [];
        const previewRows = (block.previewRows ?? []).slice(0, 15);
        return `<div class="cell text-cell" style="grid-column:${gx}/span ${gw};grid-row:${gy}/span ${gh}">
          ${block.title ? `<div class="cell-title">${esc(block.title)}</div>` : ""}
          <table class="figure-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${previewRows.map((row) =>
            `<tr>${cols.map((c) => `<td>${esc(tableValue(row[c]))}</td>`).join("")}</tr>`
          ).join("")}</tbody></table>
        </div>`;
      }

      // widget
      const cellW = (gw / 12) * 960 - 20;
      const cellH = gh * ROW_HEIGHT - 32;
      return `<div class="cell widget-cell" style="grid-column:${gx}/span ${gw};grid-row:${gy}/span ${gh}">
        ${block.title ? `<div class="cell-title">${esc(block.title)}</div>` : ""}
        ${renderWidgetSvg(block, cellW, cellH)}
      </div>`;
    }).filter(Boolean).join("\n");

    return `<div class="page">
      ${pageIdx === 0
        ? `<div class="header">
             <h1 class="dash-title">${esc(header.title)}</h1>
             <div class="dash-meta">${esc(header.permissionLabel)} · Published ${esc(header.publishedDate)} · Generated ${esc(header.generatedDate)}</div>
             ${filterSummary}
           </div>`
        : `<div class="page-header-continued">${esc(header.title)} (continued)</div>`
      }
      <div class="grid" style="grid-template-rows:repeat(${rows},${ROW_HEIGHT}px)">${gridHtml}</div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 16mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #1f2937;
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }
  .page {
    page-break-after: always;
  }
  .page:last-child {
    page-break-after: auto;
  }
  .header {
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 2px solid #e5e7eb;
  }
  .dash-title {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: #111827;
  }
  .dash-meta {
    font-size: 10px;
    color: #6b7280;
  }
  .page-header-continued {
    font-size: 11px;
    font-style: italic;
    color: #9ca3af;
    margin-bottom: 10px;
  }
  .filter-summary {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 10px;
  }
  .filter-label {
    color: #6b7280;
    font-weight: 600;
  }
  .filter-chip {
    display: inline-block;
    padding: 2px 8px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    color: #374151;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 8px;
    width: 100%;
  }
  .cell {
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    padding: 8px;
    background: white;
    overflow: hidden;
  }
  .widget-cell {
    display: flex;
    flex-direction: column;
  }
  .text-cell {
    font-size: 12px;
    line-height: 1.6;
    overflow: hidden;
  }
  .cell-title {
    font-size: 11px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chart-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80px;
    color: #9ca3af;
    font-size: 12px;
    font-style: italic;
  }
  .chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    font-size: 9px;
    color: #4b5563;
    margin-top: 4px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .legend-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    height: 100%;
  }
  .kpi-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }
  .kpi-label {
    font-size: 10px;
    color: #6b7280;
    margin-bottom: 4px;
    text-align: center;
  }
  .kpi-value {
    font-size: 26px;
    font-weight: 700;
    color: #111827;
  }
  .figure-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
  }
  .figure-table th {
    background: #f9fafb;
    text-align: left;
    padding: 4px 6px;
    border-bottom: 2px solid #d1d5db;
    white-space: nowrap;
  }
  .figure-table td {
    padding: 3px 6px;
    border-bottom: 1px solid #f3f4f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }
  svg { display: block; }
</style>
</head>
<body>
${pageContainers}
</body>
</html>`;
}
