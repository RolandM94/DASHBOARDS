import {
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { chromium } from "playwright";
import type { ReportExportFormat } from "@/types";

export type JsonObject = Record<string, unknown>;

export interface ReportExportOptions {
  include_appendix?: boolean;
  includeAppendix?: boolean;
  include_audit_note?: boolean;
  includeAuditNote?: boolean;
  include_charts?: boolean;
  includeCharts?: boolean;
}

export interface ReportExportArtifact {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
  extension: string;
}

const CONTENT_TYPES: Record<ReportExportFormat, { contentType: string; extension: string }> = {
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  pdf: {
    contentType: "application/pdf",
    extension: "pdf",
  },
  excel: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
  html: {
    contentType: "text/html; charset=utf-8",
    extension: "html",
  },
};

export function artifactMetadata(format: ReportExportFormat, title: string): { filename: string; contentType: string; extension: string } {
  const config = CONTENT_TYPES[format];
  return {
    ...config,
    filename: `${sanitizeFilename(title || "report")}.${config.extension}`,
  };
}

export function sanitizeFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "report";
}

// ── Inline SVG chart renderer ────────────────────────────────────────────────

export interface FigureData {
  figure_number: number;
  widget_id: string;
  title: string;
  widget_type: string;
  visual_config: JsonObject;
  query_output: JsonObject;
}

const CHART_COLORS = ["#4ECDC4", "#FF6B6B", "#FFD166", "#118AB2", "#073B4C", "#EF476F", "#06D6A0", "#8338EC"];

function numericValue(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  const parsed = typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface ChartRow { label: string; values: number[] }

function shortChartLabel(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value;
}

function axisTickLabel(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderYAxisTicks(maxValue: number, padding: { top: number; left: number }, chartW: number, chartH: number): string {
  const max = Math.max(maxValue, 1);
  return Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max * (1 - ratio);
    const y = padding.top + ratio * chartH;
    return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartW}" y2="${y}" stroke="#edf2f7" stroke-width="1"/><text x="${padding.left - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#64748b">${axisTickLabel(value)}</text>`;
  }).join("");
}

function summarizeChartRows(rows: ChartRow[], limit = 10): ChartRow[] {
  if (rows.length <= limit) return rows;
  const sorted = [...rows].sort((a, b) => b.values.reduce((sum, value) => sum + value, 0) - a.values.reduce((sum, value) => sum + value, 0));
  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const others = rest.reduce<number[]>((acc, row) => {
    row.values.forEach((value, index) => {
      acc[index] = (acc[index] ?? 0) + value;
    });
    return acc;
  }, []);
  return [...top, { label: "Others", values: others }];
}

function parseChartData(queryOutput: JsonObject): { columns: string[]; rows: ChartRow[]; yKeys: string[] } {
  const rawRows = Array.isArray(queryOutput.rows) ? queryOutput.rows : [];
  const columns = Array.isArray(queryOutput.columns) ? queryOutput.columns.filter((c): c is string => typeof c === "string") : [];
  const yKeysRaw = Array.isArray(queryOutput.y_keys) ? queryOutput.y_keys.filter((k): k is string => typeof k === "string") : [];
  const xKey = typeof queryOutput.x_key === "string" ? queryOutput.x_key : columns[0] ?? "label";
  const yKeys = yKeysRaw.length > 0 ? yKeysRaw : columns.filter((c) => c !== xKey);

  const rows = summarizeChartRows(rawRows.map((row) => {
    const record = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
    return {
      label: String(record[xKey] ?? ""),
      values: yKeys.map((key) => numericValue(record[key], 0)),
    };
  }));

  return { columns, rows, yKeys };
}

function svgTextSizer(value: string, size = 14): number {
  return value.length * size * 0.6;
}

function svgBarChart(figure: FigureData, width = 560, height = 340): string {
  const { rows, yKeys } = parseChartData(figure.query_output);
  if (rows.length === 0) return `<div class="chart-placeholder">No data available for ${escapeHtml(figure.title)}</div>`;

  const legendRows = Math.max(1, Math.ceil(yKeys.length / 2));
  const padding = { top: 36, right: 20, bottom: 112 + legendRows * 18, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxValue = Math.max(...rows.flatMap((r) => r.values), 1);
  const barGroupWidth = chartW / rows.length;
  const barWidth = Math.max(4, (barGroupWidth * 0.7) / yKeys.length);
  const barGap = barGroupWidth * 0.15;

  let bars = "";
  rows.forEach((row, ri) => {
    row.values.forEach((value, vi) => {
      const x = padding.left + ri * barGroupWidth + barGap + vi * barWidth;
      const barH = Math.max(2, (value / maxValue) * chartH);
      const y = padding.top + chartH - barH;
      const color = CHART_COLORS[vi % CHART_COLORS.length];
      bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${color}" rx="2"/>`;
    });
  });

  let xLabels = "";
  rows.forEach((row, ri) => {
    const x = padding.left + ri * barGroupWidth + barGroupWidth / 2;
    const y = padding.top + chartH + 18;
    xLabels += `<text x="${x}" y="${y}" text-anchor="end" font-size="9" fill="#374151" transform="rotate(-35 ${x} ${y})">${escapeHtml(shortChartLabel(row.label, 14))}</text>`;
  });

  let legend = "";
  yKeys.forEach((key, vi) => {
    const col = vi % 2;
    const row = Math.floor(vi / 2);
    const lx = padding.left + col * 230;
    const ly = padding.top + chartH + 82 + row * 18;
    legend += `<rect x="${lx}" y="${ly - 8}" width="10" height="10" fill="${CHART_COLORS[vi % CHART_COLORS.length]}" rx="1"/>`;
    legend += `<text x="${lx + 14}" y="${ly}" font-size="9" fill="#6b7280">${escapeHtml(shortChartLabel(key, 34))}</text>`;
  });

  const axis = renderYAxisTicks(maxValue, padding, chartW, chartH);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" style="max-width:560px" role="img" aria-label="${escapeHtml(figure.title)}">
    ${axis}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${padding.left + chartW}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    ${bars}
    ${xLabels}
    ${legend}
  </svg>`;
}

function svgLineChart(figure: FigureData, width = 560, height = 340): string {
  const { rows, yKeys } = parseChartData(figure.query_output);
  if (rows.length === 0) return `<div class="chart-placeholder">No data available for ${escapeHtml(figure.title)}</div>`;

  const padding = { top: 20, right: 20, bottom: 60, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const allValues = rows.flatMap((r) => r.values);
  const maxValue = Math.max(...allValues, 1);

  const lines: string[] = [];
  yKeys.forEach((_, vi) => {
    const points = rows.map((row, ri) => {
      const x = padding.left + (ri / Math.max(rows.length - 1, 1)) * chartW;
      const y = padding.top + chartH - (row.values[vi] / maxValue) * chartH;
      return `${x},${y}`;
    });
    const color = CHART_COLORS[vi % CHART_COLORS.length];
    lines.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>`);
    rows.forEach((row, ri) => {
      const x = padding.left + (ri / Math.max(rows.length - 1, 1)) * chartW;
      const y = padding.top + chartH - (row.values[vi] / maxValue) * chartH;
      lines.push(`<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`);
    });
  });

  const skipLabels = rows.length > 12 ? Math.ceil(rows.length / 8) : 1;
  let xLabels = "";
  rows.forEach((row, ri) => {
    if (ri % skipLabels !== 0 && ri !== rows.length - 1) return;
    const x = padding.left + (ri / Math.max(rows.length - 1, 1)) * chartW;
    xLabels += `<text x="${x}" y="${padding.top + chartH + 20}" text-anchor="middle" font-size="11" fill="#374151">${escapeHtml(row.label.slice(0, 16))}</text>`;
  });

  const axis = renderYAxisTicks(maxValue, padding, chartW, chartH);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" style="max-width:560px" role="img" aria-label="${escapeHtml(figure.title)}">
    ${axis}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${padding.left + chartW}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    ${lines.join("\n    ")}
    ${xLabels}
  </svg>`;
}

function svgPieChart(figure: FigureData, width = 640, height = 360): string {
  const { rows, yKeys } = parseChartData(figure.query_output);
  if (rows.length === 0) return `<div class="chart-placeholder">No data available for ${escapeHtml(figure.title)}</div>`;

  const cx = 170;
  const cy = height / 2;
  const r = 125;
  const values = rows.map((row) => row.values[0] ?? 0);
  const total = Math.max(values.reduce((sum, v) => sum + v, 0), 1);

  let cumulative = 0;
  let slices = "";
  let legend = "";
  rows.forEach((row, index) => {
    const value = values[index];
    if (value <= 0) return;
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = value / total > 0.5 ? 1 : 0;

    slices += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${CHART_COLORS[index % CHART_COLORS.length]}" stroke="#fff" stroke-width="1"/>`;

    const ly = 72 + index * 18;
    legend += `<rect x="340" y="${ly - 8}" width="9" height="9" fill="${CHART_COLORS[index % CHART_COLORS.length]}" rx="1"/>`;
    legend += `<text x="354" y="${ly}" font-size="10" fill="#475569">${escapeHtml(shortChartLabel(row.label, 34))} (${Math.round(value / total * 100)}%)</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" style="max-width:640px" role="img" aria-label="${escapeHtml(figure.title)}">
    ${slices}
    ${legend}
  </svg>`;
}

function svgAreaChart(figure: FigureData, width = 560, height = 340): string {
  const { rows, yKeys } = parseChartData(figure.query_output);
  if (rows.length === 0) return `<div class="chart-placeholder">No data available for ${escapeHtml(figure.title)}</div>`;

  const padding = { top: 20, right: 20, bottom: 60, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const allValues = rows.flatMap((r) => r.values);
  const maxValue = Math.max(...allValues, 1);

  yKeys.forEach((_, vi) => {
    // TODO: implement stacked area for multi-yKey
  });

  // Single or stacked area
  const areas: string[] = [];
  const cumulative = rows.map(() => 0);
  yKeys.forEach((_, vi) => {
    const points = rows.map((row, ri) => {
      const y = padding.top + chartH - ((row.values[vi] + cumulative[ri]) / maxValue) * chartH;
      cumulative[ri] += row.values[vi];
      const x = padding.left + (ri / Math.max(rows.length - 1, 1)) * chartW;
      return `${x},${y}`;
    });
    const areaPoints = [...points];
    if (rows.length > 1) {
      areaPoints.push(
        `${padding.left + chartW},${padding.top + chartH}`,
        `${padding.left},${padding.top + chartH}`
      );
    }
    const color = CHART_COLORS[vi % CHART_COLORS.length];
    areas.push(`<path d="M ${points.join(" L ")} L ${areaPoints[areaPoints.length - 3]} L ${areaPoints[areaPoints.length - 2]} L ${areaPoints[areaPoints.length - 1]} Z" fill="${color}" opacity="0.3"/>`);
    areas.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>`);
  });

  const axis = renderYAxisTicks(maxValue, padding, chartW, chartH);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" style="max-width:560px" role="img" aria-label="${escapeHtml(figure.title)}">
    ${axis}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${padding.left + chartW}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    ${areas.join("\n    ")}
  </svg>`;
}

function renderFigureHtml(figure: FigureData): string {
  const chartType = String(figure.visual_config.chartType ?? figure.widget_type ?? "table");
  let chartHtml = "";

  if (chartType.includes("pie")) {
    chartHtml = svgPieChart(figure);
  } else if (chartType.includes("bar")) {
    chartHtml = svgBarChart(figure);
  } else if (chartType.includes("line")) {
    chartHtml = svgLineChart(figure);
  } else if (chartType.includes("area")) {
    chartHtml = svgAreaChart(figure);
  } else if (chartType === "kpi") {
    const { rows, yKeys } = parseChartData(figure.query_output);
    const value = rows.length > 0 && yKeys.length > 0 ? rows[0].values[0] : 0;
    const label = yKeys[0] ?? "Value";
    chartHtml = `<div class="kpi-box"><span class="kpi-value">${value.toLocaleString()}</span><span class="kpi-label">${escapeHtml(label)}</span></div>`;
  } else {
    // table or unknown — render as data table
    const { rows, columns } = parseChartData(figure.query_output);
    const headers = columns.slice(0, 8);
    chartHtml = `<table class="figure-table"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 50).map((row) => `<tr>${headers.map((h) => `<td>${escapeHtml(String((row as unknown as Record<string, unknown>)[h] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  return `<figure class="report-figure">
    ${chartHtml}
    <figcaption>Figure ${figure.figure_number}: ${escapeHtml(figure.title)}</figcaption>
  </figure>`;
}

function renderFigureDocxImage(figure: FigureData): string {
  // Return inline SVG as a fallback for DOCX — Playwright screenshot will replace this
  // when rendered via PDF pipeline. For pure DOCX, we render a simple table.
  const { rows, columns, yKeys } = parseChartData(figure.query_output);
  const value = rows.length > 0 && yKeys.length > 0 ? rows[0].values[0] : 0;
  const label = yKeys[0] ?? "Value";

  return `<w:p>
    <w:pPr><w:pStyle w:val="Caption"/></w:pPr>
    <w:r><w:t xml:space="preserve">Figure ${figure.figure_number}: ${xmlEscape(figure.title)} — ${value.toLocaleString()} ${xmlEscape(label)}</w:t></w:r>
  </w:p>`;
}

export function renderInlineSvgForFigure(figure: FigureData): string {
  return renderFigureHtml(figure);
}

export function collectFigures(sections: unknown[]): FigureData[] {
  const figures: FigureData[] = [];
  for (const section of sections) {
    const record = section && typeof section === "object" ? section as Record<string, unknown> : null;
    if (!record) continue;
    const embeddedFigures = Array.isArray(record.embedded_figures) ? record.embedded_figures : [];
    for (const fig of embeddedFigures) {
      if (fig && typeof fig === "object") {
        figures.push(fig as unknown as FigureData);
      }
    }
  }
  return figures;
}

export function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function asRecordArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

export function titleFromPayload(payload: JsonObject): string {
  return typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Report";
}

export function shouldIncludeAppendix(options: ReportExportOptions = {}): boolean {
  return options.include_appendix ?? options.includeAppendix ?? true;
}

export function shouldIncludeAuditNote(options: ReportExportOptions = {}): boolean {
  return options.include_audit_note ?? options.includeAuditNote ?? true;
}

export function shouldIncludeCharts(options: ReportExportOptions = {}): boolean {
  return options.include_charts ?? options.includeCharts ?? true;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(markdown: unknown): string {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const html: string[] = [];
  let listOpen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      continue;
    }
    if (trimmed.startsWith("### ")) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("## ")) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith("- ")) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(trimmed.slice(2))}</li>`);
    } else {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
    }
  }

  if (listOpen) html.push("</ul>");
  return html.join("\n");
}

function inlineMarkdown(value: unknown): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*+/g, "");
}

function plainTextFromMarkdown(value: unknown): string {
  return String(value ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*-\s+/gm, "• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");
}

export function renderReportHtml(payload: JsonObject, options: ReportExportOptions = {}): string {
  const title = titleFromPayload(payload);
  const sections = asRecordArray(payload.sections);
  const includeCharts = shouldIncludeCharts(options);
  const allFigures = includeCharts ? collectFigures(sections) : [];

  const sectionHtml = sections.map((section) => {
    const content = String(section.content_markdown ?? "");
    let rendered = markdownToHtml(content);

    // Replace {{FIGURE:N}} placeholders with inline SVGs
    if (includeCharts) {
      const record = section as Record<string, unknown>;
      const embeddedFigures = Array.isArray(record.embedded_figures) ? record.embedded_figures : [];
      rendered = rendered.replace(/\{\{FIGURE:(\d+)\}\}/g, (_match, num) => {
        const fig = (embeddedFigures as unknown[]).find((f) => {
          const obj = f as Record<string, unknown>;
          return obj.figure_number === Number(num);
        });
        if (fig) return renderFigureHtml(fig as unknown as FigureData);
        return `[Figure ${num} not found]`;
      });
    }

    // Any figures not referenced via {{FIGURE:N}} go at the end
    if (includeCharts) {
      const record = section as Record<string, unknown>;
      const embeddedFigures = Array.isArray(record.embedded_figures) ? record.embedded_figures : [];
      const referencedNums = new Set<number>();
      const placeholderRegex = /\{\{FIGURE:(\d+)\}\}/g;
      let m: RegExpExecArray | null;
      while ((m = placeholderRegex.exec(content)) !== null) {
        referencedNums.add(Number(m[1]));
      }
      const trailing = (embeddedFigures as unknown[]).filter((f) => {
        const obj = f as Record<string, unknown>;
        return !referencedNums.has(obj.figure_number as number);
      });
      for (const fig of trailing) {
        rendered += renderFigureHtml(fig as unknown as FigureData);
      }
    }

    return `<section>
    <h2>${escapeHtml(String(section.title ?? "Untitled section"))}</h2>
    ${rendered}
  </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { color: #111827; font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.55; margin: 48px; }
    h1, h2, h3 { line-height: 1.2; }
    h1 { font-size: 30px; margin-bottom: 8px; }
    h2 { border-bottom: 1px solid #e5e7eb; font-size: 20px; margin-top: 32px; padding-bottom: 6px; }
    h3 { font-size: 16px; margin-top: 22px; }
    pre { background: #f9fafb; border: 1px solid #e5e7eb; overflow: auto; padding: 12px; }
    .muted { color: #6b7280; }
    .toc li { margin: 4px 0; }
    .report-figure { margin: 24px 0; text-align: center; }
    .report-figure svg { display: block; margin: 0 auto; }
    .report-figure figcaption { font-size: 12px; color: #6b7280; margin-top: 8px; font-style: italic; }
    .kpi-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; background: #f9fafb; margin: 16px auto; max-width: 300px; }
    .kpi-value { font-size: 32px; font-weight: 700; color: #111827; display: block; }
    .kpi-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .figure-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 16px 0; }
    .figure-table th { background: #f3f4f6; text-align: left; padding: 6px 10px; border: 1px solid #e5e7eb; }
    .figure-table td { padding: 4px 10px; border: 1px solid #e5e7eb; }
    .chart-placeholder { color: #9ca3af; font-style: italic; text-align: center; padding: 24px; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    code { font-family: "Courier New", monospace; font-size: 10pt; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 3px; padding: 0 3px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <h2>Table Of Contents</h2>
  <ol class="toc">
    ${sections.map((section) => `<li>${escapeHtml(section.title)}</li>`).join("\n    ")}
  </ol>
  ${sectionHtml}
</body>
</html>`;
}

export function renderReportText(payload: JsonObject, options: ReportExportOptions = {}): string {
  void options;
  const title = titleFromPayload(payload);
  const sections = asRecordArray(payload.sections);
  const lines: string[] = [
    title,
    "=".repeat(title.length),
    "",
    "TABLE OF CONTENTS",
    ...sections.map((section, index) => `${index + 1}. ${String(section.title ?? "Untitled section")}`),
    "",
  ];

  for (const section of sections) {
    lines.push(String(section.title ?? "Untitled section").toUpperCase());

    let content = plainTextFromMarkdown(section.content_markdown);
    // Replace {{FIGURE:N}} with text references
    const record = section as Record<string, unknown>;
    const embeddedFigures = Array.isArray(record.embedded_figures) ? record.embedded_figures : [];
    content = content.replace(/\{\{FIGURE:(\d+)\}\}/g, (_match, num) => {
      const fig = (embeddedFigures as unknown[]).find((f) => {
        const obj = f as Record<string, unknown>;
        return obj.figure_number === Number(num);
      });
      if (fig) return `[Figure ${(fig as Record<string, unknown>).figure_number}: ${(fig as Record<string, unknown>).title}]`;
      return `[Figure ${num}]`;
    });

    lines.push(content);

    // List figures
    if (embeddedFigures.length > 0) {
      lines.push("");
      lines.push("Figures:");
      for (const fig of embeddedFigures) {
        const f = fig as unknown as FigureData;
        lines.push(`  Figure ${f.figure_number}: ${f.title} (${f.widget_type})`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function xmlEscape(value: unknown): string {
  return escapeHtml(value).replace(/'/g, "&apos;");
}

function docxParagraph(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createZip(entries: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const central: number[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const content = encoder.encode(entry.content);
    const checksum = crc32(content);
    const offset = output.length;

    pushUint32(output, 0x04034b50);
    pushUint16(output, 20);
    pushUint16(output, 0);
    pushUint16(output, 0);
    pushUint16(output, 0);
    pushUint16(output, 0);
    pushUint32(output, checksum);
    pushUint32(output, content.length);
    pushUint32(output, content.length);
    pushUint16(output, name.length);
    pushUint16(output, 0);
    output.push(...name, ...content);

    pushUint32(central, 0x02014b50);
    pushUint16(central, 20);
    pushUint16(central, 20);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint32(central, checksum);
    pushUint32(central, content.length);
    pushUint32(central, content.length);
    pushUint16(central, name.length);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint16(central, 0);
    pushUint32(central, 0);
    pushUint32(central, offset);
    central.push(...name);
  }

  const centralOffset = output.length;
  output.push(...central);
  pushUint32(output, 0x06054b50);
  pushUint16(output, 0);
  pushUint16(output, 0);
  pushUint16(output, entries.length);
  pushUint16(output, entries.length);
  pushUint32(output, central.length);
  pushUint32(output, centralOffset);
  pushUint16(output, 0);

  return new Uint8Array(output);
}

function docxTextParagraph(text: string, heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading,
    spacing: { after: heading ? 180 : 120 },
    children: [new TextRun({ text, font: "Times New Roman", size: heading ? 28 : 22 })],
  });
}

function docxMarkdown(markdown: unknown): Paragraph[] {
  return String(markdown ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("### ")) return docxTextParagraph(line.slice(4), HeadingLevel.HEADING_3);
      if (line.startsWith("## ")) return docxTextParagraph(line.slice(3), HeadingLevel.HEADING_2);
      if (line.startsWith("# ")) return docxTextParagraph(line.slice(2), HeadingLevel.HEADING_1);
      if (line.startsWith("- ")) return docxTextParagraph(`• ${line.slice(2)}`);
      return docxTextParagraph(plainTextFromMarkdown(line));
    });
}

function docxTable(title: string, rows: JsonObject[]): (Paragraph | Table)[] {
  if (rows.length === 0) return [docxTextParagraph(title, HeadingLevel.HEADING_3), docxTextParagraph("No tabular data available.")];

  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
  return [
    docxTextParagraph(title, HeadingLevel.HEADING_3),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: columns.map((column) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: column, bold: true, font: "Times New Roman", size: 22 })] })],
          })),
        }),
        ...rows.slice(0, 50).map((row) => new TableRow({
          children: columns.map((column) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(row[column] ?? ""), font: "Times New Roman", size: 22 })] })],
          })),
        })),
      ],
    }),
  ];
}

export async function renderReportDocx(payload: JsonObject, options: ReportExportOptions = {}): Promise<Uint8Array> {
  const title = titleFromPayload(payload);
  const sections = asRecordArray(payload.sections);
  const includeCharts = shouldIncludeCharts(options);
  const allFigures = includeCharts ? collectFigures(sections) : [];
  const children: Array<Paragraph | Table | TableOfContents> = [
    docxTextParagraph(title, HeadingLevel.TITLE),
    new Paragraph({ children: [new PageBreak()] }),
    docxTextParagraph("Table Of Contents", HeadingLevel.HEADING_1),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  ];

  for (const section of sections) {
    children.push(docxTextParagraph(String(section.title ?? "Untitled section"), HeadingLevel.HEADING_1));
    children.push(...docxMarkdown(section.content_markdown));

    // Render figures for this section as tables
    if (includeCharts) {
      const record = section as Record<string, unknown>;
      const embeddedFigures = Array.isArray(record.embedded_figures) ? record.embedded_figures : [];
      for (const fig of embeddedFigures) {
        const f = fig as unknown as FigureData;
        const { rows, columns } = parseChartData(f.query_output);
        const headerColumns = columns.slice(0, 8);
        children.push(new Paragraph({
          spacing: { before: 240 },
          children: [new TextRun({ text: `Figure ${f.figure_number}: ${f.title}`, italics: true, font: "Times New Roman", size: 22 })],
        }));
        if (rows.length > 0 && headerColumns.length > 0) {
          children.push(...docxTable(f.title, rows.map((row) => {
            const obj: Record<string, unknown> = {};
            headerColumns.forEach((col, ci) => {
              obj[col] = row.values[ci] ?? (row as unknown as Record<string, unknown>)[col];
            });
            return obj;
          })));
        }
      }
    }
  }

  const document = new Document({
    title,
    creator: "Eyemark",
    description: "AI-generated report export",
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      children,
    }],
    features: { updateFields: true },
  });

  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}

export async function renderReportPdf(payload: JsonObject, options: ReportExportOptions = {}): Promise<Uint8Array> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(renderReportHtml(payload, options), { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: "22mm", right: "18mm", bottom: "22mm", left: "18mm" },
      footerTemplate: `<div style="font-family: 'Times New Roman', Times, serif; font-size: 8px; color: #6b7280; width: 100%; padding: 0 18mm; text-align: right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      headerTemplate: `<div></div>`,
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

export function renderReportHtmlArtifact(payload: JsonObject, options: ReportExportOptions = {}): Uint8Array {
  return new TextEncoder().encode(renderReportHtml(payload, options));
}
