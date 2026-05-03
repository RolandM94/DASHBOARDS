// ── Shared chart/table/KPI rendering utilities for reports ────────────────────
// Used by both exportEngineCore (DOCX/PDF export) and previewRenderer (live preview)

type JsonObject = Record<string, unknown>;
type R = Record<string, unknown>;

export const CHART_COLORS = ["#4ECDC4", "#FF6B6B", "#FFD166", "#118AB2", "#073B4C", "#EF476F", "#06D6A0", "#8338EC"];

// ── HTML / text helpers ───────────────────────────────────────────────────────

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function nv(value: unknown, fb = 0): number {
  if (typeof value === "number") return value;
  const p = typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(p) ? p : fb;
}

// ── Label / axis helpers ──────────────────────────────────────────────────────

export function shortLabel(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value;
}

export function axisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function kpiValue(value: unknown): { display: string; full: string } {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) {
    const text = String(value ?? "\u2014");
    return { display: text, full: text };
  }
  const full = num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000_000) return { display: `${(num / 1_000_000_000_000).toFixed(2).replace(/\.?0+$/, "")}T`, full };
  if (abs >= 1_000_000_000) return { display: `${(num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`, full };
  if (abs >= 1_000_000) return { display: `${(num / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`, full };
  if (abs >= 100_000) return { display: `${(num / 1_000).toFixed(1).replace(/\.?0+$/, "")}K`, full };
  return { display: full, full };
}

export function yAxisTicks(maxValue: number, pad: { t: number; l: number }, cw: number, ch: number): string {
  const max = Math.max(maxValue, 1);
  return Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max * (1 - ratio);
    const y = pad.t + ratio * ch;
    return `<line x1="${pad.l}" y1="${y}" x2="${pad.l + cw}" y2="${y}" stroke="#edf2f7" stroke-width="1"/><text x="${pad.l - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#64748b">${axisValue(value)}</text>`;
  }).join("");
}

// ── Chart row parsing ─────────────────────────────────────────────────────────

export interface ChartRow { label: string; values: number[] }

export function summarizeRows(rows: ChartRow[], limit = 10): ChartRow[] {
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

export function parseChart(queryOutput: JsonObject): { columns: string[]; rows: ChartRow[]; yKeys: string[] } {
  const rawRows = Array.isArray(queryOutput.rows) ? queryOutput.rows : [];
  const columns = Array.isArray(queryOutput.columns) ? queryOutput.columns.filter((c): c is string => typeof c === "string") : [];
  const yKeysRaw = Array.isArray(queryOutput.y_keys) ? queryOutput.y_keys.filter((k): k is string => typeof k === "string") : [];
  const xKey = typeof queryOutput.x_key === "string" ? queryOutput.x_key : columns[0] ?? "label";
  const yKeys = yKeysRaw.length > 0 ? yKeysRaw : columns.filter((c) => c !== xKey);

  return {
    columns,
    yKeys,
    rows: summarizeRows(rawRows.map((row) => {
      const record = row && typeof row === "object" && !Array.isArray(row) ? row as R : {};
      return {
        label: String(record[xKey] ?? ""),
        values: yKeys.map((key) => nv(record[key])),
      };
    })),
  };
}

export function parseTable(queryOutput: JsonObject): { columns: string[]; rows: R[] } {
  const rawRows = Array.isArray(queryOutput.rows) ? queryOutput.rows : [];
  const rows = rawRows.filter((row): row is R => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  const configuredColumns = Array.isArray(queryOutput.columns)
    ? queryOutput.columns.filter((column): column is string => typeof column === "string")
    : [];
  const columns = configuredColumns.length > 0
    ? configuredColumns
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return { columns, rows };
}

export function tableValue(value: unknown): string {
  return typeof value === "number"
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(value ?? "");
}

// ── SVG chart renderers ───────────────────────────────────────────────────────

export function svgBar(figure: R, w = 560, h = 340): string {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-placeholder">No data for this chart</div>`;
  const legendRows = Math.max(1, Math.ceil(yKeys.length / 2));
  const pad = { t: 36, r: 20, b: 112 + legendRows * 18, l: 60 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const mx = Math.max(...rows.flatMap((r) => r.values), 1);
  const bgw = cw / rows.length;
  const bw = Math.max(4, (bgw * 0.7) / yKeys.length);
  let bars = "";
  let xLabels = "";
  rows.forEach((row, ri) => {
    row.values.forEach((v, vi) => {
      const x = pad.l + ri * bgw + bgw * 0.15 + vi * bw;
      const bh = Math.max(2, (v / mx) * ch);
      bars += `<rect x="${x}" y="${pad.t + ch - bh}" width="${bw}" height="${bh}" fill="${CHART_COLORS[vi % 8]}" rx="2"/>`;
    });
    const lx = pad.l + ri * bgw + bgw / 2;
    const ly = pad.t + ch + 18;
    xLabels += `<text x="${lx}" y="${ly}" text-anchor="end" font-size="9" fill="#374151" transform="rotate(-35 ${lx} ${ly})">${esc(shortLabel(row.label, 14))}</text>`;
  });
  let lgd = "";
  yKeys.forEach((k, vi) => {
    const col = vi % 2;
    const row = Math.floor(vi / 2);
    const lx = pad.l + col * 230;
    const ly = pad.t + ch + 82 + row * 18;
    lgd += `<rect x="${lx}" y="${ly - 8}" width="10" height="10" fill="${CHART_COLORS[vi % 8]}" rx="1"/><text x="${lx + 14}" y="${ly}" font-size="9" fill="#6b7280">${esc(shortLabel(k, 34))}</text>`;
  });
  const axis = yAxisTicks(mx, pad, cw, ch);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:560px" role="img">${axis}<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#cbd5e1" stroke-width="1"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#cbd5e1" stroke-width="1"/>${bars}${xLabels}${lgd}</svg>`;
}

export function svgLine(figure: R, w = 560, h = 340): string {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-placeholder">No data for this chart</div>`;
  const pad = { t: 20, r: 20, b: 60, l: 60 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const mx = Math.max(...rows.flatMap((r) => r.values), 1);
  let els = "";
  yKeys.forEach((_, vi) => {
    const pts = rows.map((row, ri) => `${pad.l + (ri / Math.max(rows.length - 1, 1)) * cw},${pad.t + ch - (row.values[vi] / mx) * ch}`);
    els += `<polyline points="${pts.join(" ")}" fill="none" stroke="${CHART_COLORS[vi % 8]}" stroke-width="2"/>`;
    rows.forEach((row, ri) => {
      els += `<circle cx="${pad.l + (ri / Math.max(rows.length - 1, 1)) * cw}" cy="${pad.t + ch - (row.values[vi] / mx) * ch}" r="3" fill="${CHART_COLORS[vi % 8]}"/>`;
    });
  });
  const axis = yAxisTicks(mx, pad, cw, ch);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:560px" role="img">${axis}<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#cbd5e1" stroke-width="1"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#cbd5e1" stroke-width="1"/>${els}</svg>`;
}

export function svgPie(figure: R, w = 640, h = 360): string {
  const { rows } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-placeholder">No data for this chart</div>`;
  const cx = 170;
  const cy = h / 2;
  const r = 125;
  const vals = rows.map((row) => row.values[0] ?? 0);
  const total = Math.max(vals.reduce((s, v) => s + v, 0), 1);
  let slices = "";
  let lgd = "";
  let cum = 0;
  rows.forEach((row, i) => {
    const v = vals[i];
    if (v <= 0) return;
    const sa = (cum / total) * 2 * Math.PI - Math.PI / 2;
    cum += v;
    const ea = (cum / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    slices += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${v / total > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z" fill="${CHART_COLORS[i % 8]}" stroke="#fff" stroke-width="1"/>`;
    const ly = 72 + i * 18;
    lgd += `<rect x="340" y="${ly - 8}" width="9" height="9" fill="${CHART_COLORS[i % 8]}" rx="1"/><text x="354" y="${ly}" font-size="10" fill="#475569">${esc(shortLabel(row.label, 34))} (${Math.round((v / total) * 100)}%)</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:640px" role="img">${slices}${lgd}</svg>`;
}

export function svgArea(figure: R, w = 560, h = 340): string {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-placeholder">No data for this chart</div>`;
  const pad = { t: 20, r: 20, b: 60, l: 60 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const cum = rows.map(() => 0);
  let els = "";
  yKeys.forEach((_, vi) => {
    const pts = rows.map((row, ri) => {
      cum[ri] += row.values[vi];
      return `${pad.l + (ri / Math.max(rows.length - 1, 1)) * cw},${pad.t + ch - (cum[ri] / Math.max(...cum, 1)) * ch}`;
    });
    if (rows.length > 1) pts.push(`${pad.l + cw},${pad.t + ch}`, `${pad.l},${pad.t + ch}`);
    els += `<path d="M ${pts[0]}${pts.slice(1).map((pt) => ` L ${pt}`).join("")} Z" fill="${CHART_COLORS[vi % 8]}" opacity="0.3"/>`;
    els += `<polyline points="${rows.map((_row, ri) => pts[ri]).join(" ")}" fill="none" stroke="${CHART_COLORS[vi % 8]}" stroke-width="2"/>`;
  });
  const mx = Math.max(...rows.flatMap((row) => row.values), 1);
  const axis = yAxisTicks(mx, pad, cw, ch);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:560px" role="img">${axis}<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#cbd5e1" stroke-width="1"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#cbd5e1" stroke-width="1"/>${els}</svg>`;
}

// ── Figure rendering ──────────────────────────────────────────────────────────

export function figureHtml(figure: R): string {
  const ct = String((figure.visual_config as R)?.chartType ?? figure.widget_type ?? "table");
  let chart = "";
  if (ct.includes("pie")) chart = svgPie(figure);
  else if (ct.includes("bar")) chart = svgBar(figure);
  else if (ct.includes("line")) chart = svgLine(figure);
  else if (ct.includes("area")) chart = svgArea(figure);
  else if (ct === "kpi") {
    const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
    const row = rows[0];
    chart = `<div class="kpi-grid">${yKeys.map((key, index) => {
      const value = kpiValue(row?.values[index] ?? 0);
      return `<div class="kpi-box"><span class="kpi-label" title="${esc(key)}">${esc(key)}</span><span class="kpi-value" title="${esc(value.full)}">${esc(value.display)}</span></div>`;
    }).join("")}</div>`;
  } else {
    const { rows, columns } = parseTable(figure.query_output as JsonObject);
    const hdrs = columns.slice(0, 8);
    chart = `<table class="figure-table"><thead><tr>${hdrs.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 50).map((row) => `<tr>${hdrs.map((h) => `<td>${esc(tableValue(row[h]))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  return `<figure class="report-figure">${chart}<figcaption>Figure ${esc(figure.figure_number)}: ${esc(figure.title)}</figcaption></figure>`;
}

// ── Markdown / rich text rendering ────────────────────────────────────────────

export function looksLikeHtml(value: unknown): boolean {
  return /<\/?(p|h[1-6]|ul|ol|li|strong|b|em|i|u|span|font|br)\b/i.test(String(value ?? ""));
}

export function sanitizeRichHtml(html: unknown): string {
  let value = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\S+/gi, "")
    .replace(/\s(href|src)="[^"]*"/gi, "")
    .replace(/\s(href|src)='[^']*'/gi, "");

  value = value.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, tag, attrs) => {
    const name = String(tag).toLowerCase();
    if (!["p", "h1", "h2", "h3", "ul", "ol", "li", "strong", "b", "em", "i", "u", "span", "font", "br"].includes(name)) {
      return "";
    }
    if (match.startsWith("</")) return `</${name}>`;
    if (name === "br") return "<br>";
    const styleMatch = String(attrs).match(/\sstyle=(["'])(.*?)\1/i);
    const style = styleMatch?.[2] ?? "";
    const fontSize = style.match(/font-size:\s*(\d+(?:\.\d+)?)(px|pt)/i);
    const sizeAttr = String(attrs).match(/\ssize=(["'])([1-7])\1/i);
    const safeStyle = fontSize ? ` style="font-size:${fontSize[1]}${fontSize[2].toLowerCase()}"` : "";
    const fontAttr = name === "font" && sizeAttr ? ` size="${sizeAttr[2]}"` : "";
    return `<${name}${safeStyle}${fontAttr}>`;
  });

  return value;
}

export function inlineMd(value: unknown): string {
  return esc(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*+/g, "");
}

export function mdToHtml(md: unknown): string {
  const lines = String(md ?? "").split(/\r?\n/);
  const html: string[] = [];
  let list = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (list) { html.push("</ul>"); list = false; } continue; }
    if (t.startsWith("### ")) { if (list) { html.push("</ul>"); list = false; } html.push(`<h3>${inlineMd(t.slice(4))}</h3>`); }
    else if (t.startsWith("## ")) { if (list) { html.push("</ul>"); list = false; } html.push(`<h2>${inlineMd(t.slice(3))}</h2>`); }
    else if (t.startsWith("# ")) { if (list) { html.push("</ul>"); list = false; } html.push(`<h1>${inlineMd(t.slice(2))}</h1>`); }
    else if (t.startsWith("- ")) { if (!list) { html.push("<ul>"); list = true; } html.push(`<li>${inlineMd(t.slice(2))}</li>`); }
    else { if (list) { html.push("</ul>"); list = false; } html.push(`<p>${inlineMd(t)}</p>`); }
  }
  if (list) html.push("</ul>");
  return html.join("\n");
}

export function richTextToHtml(content: unknown): string {
  return looksLikeHtml(content) ? sanitizeRichHtml(content) : mdToHtml(content);
}

// ── Plain text helpers (for text export) ──────────────────────────────────────

export function plainTextFromMarkdown(value: unknown): string {
  return String(value ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*-\s+/gm, "\u2022 ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");
}

export function plainTextFromRichText(value: unknown): string {
  return plainTextFromMarkdown(String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\u2022 ")
    .replace(/<[^>]+>/g, ""));
}
