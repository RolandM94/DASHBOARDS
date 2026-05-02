// ── Pure HTML Preview Renderer (no Playwright, no docx) ──────────────────────
// Used for live in-browser preview of the compiled report

type JsonObject = Record<string, unknown>;
type R = Record<string, unknown>;

const CHART_COLORS = ["#4ECDC4", "#FF6B6B", "#FFD166", "#118AB2", "#073B4C", "#EF476F", "#06D6A0", "#8338EC"];

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nv(value: unknown, fb = 0): number {
  if (typeof value === "number") return value;
  const p = typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isFinite(p) ? p : fb;
}

interface ChartRow { label: string; values: number[] }

function shortLabel(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value;
}

function axisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function kpiValue(value: unknown): { display: string; full: string } {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) {
    const text = String(value ?? "—");
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

function yAxisTicks(maxValue: number, pad: { t: number; l: number }, cw: number, ch: number): string {
  const max = Math.max(maxValue, 1);
  return Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max * (1 - ratio);
    const y = pad.t + ratio * ch;
    return `<line x1="${pad.l}" y1="${y}" x2="${pad.l + cw}" y2="${y}" stroke="#edf2f7" stroke-width="1"/><text x="${pad.l - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="#64748b">${axisValue(value)}</text>`;
  }).join("");
}

function summarizeRows(rows: ChartRow[], limit = 10): ChartRow[] {
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

function parseChart(queryOutput: JsonObject): { columns: string[]; rows: ChartRow[]; yKeys: string[] } {
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

function svgBar(figure: R, w = 560, h = 340): string {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-na">No data for this chart</div>`;
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
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img">${axis}<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#cbd5e1"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#cbd5e1"/>${bars}${xLabels}${lgd}</svg>`;
}

function svgLine(figure: R, w = 560, h = 340): string {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-na">No data for this chart</div>`;
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
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img">${axis}<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#cbd5e1"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#cbd5e1"/>${els}</svg>`;
}

function svgPie(figure: R, w = 640, h = 360): string {
  const { rows } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-na">No data for this chart</div>`;
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
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg chart-svg-wide" role="img">${slices}${lgd}</svg>`;
}

function svgArea(figure: R, w = 560, h = 340): string {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-na">No data for this chart</div>`;
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
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img">${axis}<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#cbd5e1"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#cbd5e1"/>${els}</svg>`;
}

function figureHtml(figure: R): string {
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
      return `<div class="kpi-box"><span class="kpi-lbl" title="${esc(key)}">${esc(key)}</span><span class="kpi-val" title="${esc(value.full)}">${esc(value.display)}</span></div>`;
    }).join("")}</div>`;
  } else {
    const { rows, columns } = parseChart(figure.query_output as JsonObject);
    const hdrs = columns.slice(0, 8);
    chart = `<table class="fig-tbl"><thead><tr>${hdrs.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 50).map((row) => `<tr>${hdrs.map((h) => `<td>${esc(String((row as unknown as R)[h] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  return `<figure class="report-fig" contenteditable="false" data-figure-number="${esc(figure.figure_number)}">${chart}<figcaption>Figure ${figure.figure_number}: ${esc(figure.title)}</figcaption></figure>`;
}

function looksLikeHtml(value: unknown): boolean {
  return /<\/?(p|h[1-6]|ul|ol|li|strong|b|em|i|u|span|font|br)\b/i.test(String(value ?? ""));
}

function sanitizeRichHtml(html: unknown): string {
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

function richTextToHtml(content: unknown): string {
  return looksLikeHtml(content) ? sanitizeRichHtml(content) : mdToHtml(content);
}

function mdToHtml(md: unknown): string {
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

function inlineMd(value: unknown): string {
  return esc(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*+/g, "");
}

const STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #1e293b; line-height: 1.55; background: #f1f5f9; }
#preview-wrap { min-height: 100vh; padding: 24px; }
#document { max-width: 980px; margin: 0 auto; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 56px 72px; min-height: 100vh; }
.cover { text-align: center; padding: 80px 0 60px; border-bottom: 1px solid #e2e8f0; margin-bottom: 48px; }
.cover h1 { font-size: 32px; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
.cover .sub { font-size: 14px; color: #64748b; }
.section { margin-top: 48px; }
.section-title { font-size: 20px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; }
.toc-page { margin-bottom: 48px; }
.toc-page h2 { font-size: 20px; margin-bottom: 16px; color: #0f172a; }
.toc-page ol { list-style: decimal; padding-left: 20px; }
.toc-page li { font-size: 14px; padding: 4px 0; color: #334155; }
.meta { margin-bottom: 32px; }
.meta h2 { font-size: 16px; color: #0f172a; margin-bottom: 8px; }
.meta pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; overflow-x: auto; }
.report-fig { margin: 28px 0; text-align: center; }
.report-fig figcaption { font-size: 11px; color: #94a3b8; margin-top: 8px; font-style: italic; }
.chart-svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
.chart-na { color: #94a3b8; font-style: italic; text-align: center; padding: 32px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
.kpi-box { min-width: 0; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: left; background: #f8fafc; overflow: hidden; }
.kpi-val { font-size: 24px; font-weight: 800; color: #0f172a; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; }
.kpi-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
.fig-tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin: 16px 0; }
.fig-tbl th { background: #f1f5f9; text-align: left; padding: 6px 12px; border: 1px solid #e2e8f0; }
.fig-tbl td { padding: 5px 12px; border: 1px solid #e2e8f0; }
strong { font-weight: 700; }
em { font-style: italic; }
code { font-family: "Courier New", monospace; font-size: 10pt; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 3px; padding: 0 3px; }
`;

export function renderPreviewHtml(payload: JsonObject): string {
  const title = String((payload.title ?? "Report").toString());
  const sections = Array.isArray(payload.sections) ? payload.sections as R[] : [];

  // Build sections with figures
  const sectionHtml = sections.map((s, si) => {
    let content = String(s.content_markdown ?? "");
    const figs = Array.isArray(s.embedded_figures) ? s.embedded_figures as R[] : [];
    const figureTokens = new Map<string, string>();

    // Replace {{FIGURE:N}} with rendered figures
    const used = new Set<number>();
    content = content.replace(/\{\{FIGURE:(\d+)\}\}/g, (_match, num) => {
      const n = Number(num);
      const fig = figs.find((f) => f.figure_number === n);
      if (fig) {
        const token = `__EYEMARK_FIGURE_${si}_${n}__`;
        used.add(n);
        figureTokens.set(token, figureHtml(fig));
        return token;
      }
      return `[Figure ${n} not found]`;
    });

    // Append unreferenced figures
    for (const fig of figs) {
      if (!used.has(Number(fig.figure_number))) {
        const token = `__EYEMARK_FIGURE_${si}_${Number(fig.figure_number)}__`;
        figureTokens.set(token, figureHtml(fig));
        content += `\n\n${token}`;
      }
    }

    let rendered = richTextToHtml(content);
    for (const [token, html] of figureTokens) {
      rendered = rendered
        .replaceAll(`<p>${token}</p>`, html)
        .replaceAll(token, html);
    }

    return `<div class="section" id="section-${si}" data-section-id="${esc(s.id ?? "")}">
      <div class="section-title">${esc(String(s.title ?? `Section ${si + 1}`))}</div>
      <div class="section-body" data-section-id="${esc(s.id ?? "")}">${rendered}</div>
    </div>`;
  }).join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>${STYLE}</style>
</head>
<body>
<div id="preview-wrap">
  <div id="document">
    <div class="cover">
      <h1>${esc(title)}</h1>
    </div>
    <div class="toc-page">
      <h2>Table of Contents</h2>
      <ol>${sections.map((s, i) => `<li>${esc(String(s.title ?? `Section ${i + 1}`))}</li>`).join("")}</ol>
    </div>
    ${sectionHtml}
  </div>
</div>
</body>
</html>`;

  return html;
}
