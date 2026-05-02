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

function parseChart(queryOutput: JsonObject): { columns: string[]; rows: ChartRow[]; yKeys: string[] } {
  const rawRows = Array.isArray(queryOutput.rows) ? queryOutput.rows : [];
  const columns = Array.isArray(queryOutput.columns) ? queryOutput.columns.filter((c): c is string => typeof c === "string") : [];
  const yKeysRaw = Array.isArray(queryOutput.y_keys) ? queryOutput.y_keys.filter((k): k is string => typeof k === "string") : [];
  const xKey = typeof queryOutput.x_key === "string" ? queryOutput.x_key : columns[0] ?? "label";
  const yKeys = yKeysRaw.length > 0 ? yKeysRaw : columns.filter((c) => c !== xKey);

  return {
    columns,
    yKeys,
    rows: rawRows.map((row) => {
      const record = row && typeof row === "object" && !Array.isArray(row) ? row as R : {};
      return {
        label: String(record[xKey] ?? ""),
        values: yKeys.map((key) => nv(record[key])),
      };
    }),
  };
}

function svgBar(figure: R, w = 560, h = 340): string {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-na">No data for this chart</div>`;
  const pad = { t: 40, r: 20, b: 80, l: 60 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const mx = Math.max(...rows.flatMap((r) => r.values), 1);
  const bgw = cw / rows.length;
  const bw = Math.max(4, (bgw * 0.7) / yKeys.length);
  let bars = "";
  let xLabels = "";
  const skip = rows.length > 12 ? Math.ceil(rows.length / 8) : 1;
  rows.forEach((row, ri) => {
    row.values.forEach((v, vi) => {
      const x = pad.l + ri * bgw + bgw * 0.15 + vi * bw;
      const bh = Math.max(2, (v / mx) * ch);
      bars += `<rect x="${x}" y="${pad.t + ch - bh}" width="${bw}" height="${bh}" fill="${CHART_COLORS[vi % 8]}" rx="2"/>`;
    });
    if (ri % skip === 0 || ri === rows.length - 1) {
      xLabels += `<text x="${pad.l + ri * bgw + bgw / 2}" y="${pad.t + ch + 20}" text-anchor="middle" font-size="11" fill="#374151">${esc(row.label.slice(0, 16))}</text>`;
    }
  });
  let lgd = "";
  yKeys.forEach((k, vi) => {
    const lx = pad.l + 10 + vi * 120;
    lgd += `<rect x="${lx}" y="${pad.t + ch + 42}" width="10" height="10" fill="${CHART_COLORS[vi % 8]}" rx="1"/><text x="${lx + 14}" y="${pad.t + ch + 50}" font-size="10" fill="#6b7280">${esc(k)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img"><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#e5e7eb"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#e5e7eb"/>${bars}${xLabels}${lgd}</svg>`;
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
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img"><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#e5e7eb"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#e5e7eb"/>${els}</svg>`;
}

function svgPie(figure: R, w = 400, h = 320): string {
  const { rows } = parseChart(figure.query_output as JsonObject);
  if (rows.length === 0) return `<div class="chart-na">No data for this chart</div>`;
  const cx = w / 2;
  const cy = h / 2 - 10;
  const r = Math.min(cx, cy) - 40;
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
    lgd += `<rect x="${w - 140}" y="${18 + i * 16}" width="8" height="8" fill="${CHART_COLORS[i % 8]}" rx="1"/><text x="${w - 128}" y="${25 + i * 16}" font-size="9" fill="#6b7280">${esc(row.label)} (${Math.round((v / total) * 100)}%)</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img">${slices}${lgd}</svg>`;
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
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img"><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ch}" stroke="#e5e7eb"/><line x1="${pad.l}" y1="${pad.t + ch}" x2="${pad.l + cw}" y2="${pad.t + ch}" stroke="#e5e7eb"/>${els}</svg>`;
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
    const v = rows.length > 0 && yKeys.length > 0 ? rows[0].values[0] : 0;
    chart = `<div class="kpi-box"><span class="kpi-val">${v.toLocaleString()}</span><span class="kpi-lbl">${esc(yKeys[0] ?? "Value")}</span></div>`;
  } else {
    const { rows, columns } = parseChart(figure.query_output as JsonObject);
    const hdrs = columns.slice(0, 8);
    chart = `<table class="fig-tbl"><thead><tr>${hdrs.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 50).map((row) => `<tr>${hdrs.map((h) => `<td>${esc(String((row as unknown as R)[h] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  return `<figure class="report-fig">${chart}<figcaption>Figure ${figure.figure_number}: ${esc(figure.title)}</figcaption></figure>`;
}

function mdToHtml(md: unknown): string {
  const lines = String(md ?? "").split(/\r?\n/);
  const html: string[] = [];
  let list = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (list) { html.push("</ul>"); list = false; } continue; }
    if (t.startsWith("### ")) { if (list) { html.push("</ul>"); list = false; } html.push(`<h3>${esc(t.slice(4))}</h3>`); }
    else if (t.startsWith("## ")) { if (list) { html.push("</ul>"); list = false; } html.push(`<h2>${esc(t.slice(3))}</h2>`); }
    else if (t.startsWith("# ")) { if (list) { html.push("</ul>"); list = false; } html.push(`<h1>${esc(t.slice(2))}</h1>`); }
    else if (t.startsWith("- ")) { if (!list) { html.push("<ul>"); list = true; } html.push(`<li>${esc(t.slice(2))}</li>`); }
    else { if (list) { html.push("</ul>"); list = false; } html.push(`<p>${esc(t)}</p>`); }
  }
  if (list) html.push("</ul>");
  return html.join("\n");
}

const STYLE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.65; background: #f1f5f9; }
#preview-wrap { display: flex; min-height: 100vh; }
#toc { width: 260px; position: sticky; top: 0; height: 100vh; overflow-y: auto; background: #fff; border-right: 1px solid #e2e8f0; padding: 24px 20px; flex-shrink: 0; }
#toc h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 16px; }
#toc a { display: block; font-size: 13px; color: #475569; text-decoration: none; padding: 4px 8px; border-radius: 4px; margin-bottom: 2px; }
#toc a:hover, #toc a.active { background: #f1f5f9; color: #0f172a; font-weight: 600; }
#document { flex: 1; max-width: 800px; margin: 40px auto; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 56px 64px; min-height: 100vh; }
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
.kpi-box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; text-align: center; background: #f8fafc; margin: 16px auto; max-width: 280px; }
.kpi-val { font-size: 36px; font-weight: 800; color: #0f172a; display: block; }
.kpi-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.fig-tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin: 16px 0; }
.fig-tbl th { background: #f1f5f9; text-align: left; padding: 6px 12px; border: 1px solid #e2e8f0; }
.fig-tbl td { padding: 5px 12px; border: 1px solid #e2e8f0; }
`;

export function renderPreviewHtml(payload: JsonObject): string {
  const title = String((payload.title ?? "Report").toString());
  const sections = Array.isArray(payload.sections) ? payload.sections as R[] : [];
  const metadata = payload.metadata as R ?? {};
  const scope = payload.scope as R ?? {};
  const sourceNote = String(payload.source_note ?? "");

  // Build TOC
  const tocLinks = sections.map((s, i) => `
    <a href="#section-${i}" onclick="document.getElementById('section-${i}')?.scrollIntoView({behavior:'smooth'});return false">
      ${esc(String(s.title ?? `Section ${i + 1}`))}
    </a>`).join("");

  // Build sections with figures
  const sectionHtml = sections.map((s, si) => {
    let content = String(s.content_markdown ?? "");
    const figs = Array.isArray(s.embedded_figures) ? s.embedded_figures as R[] : [];

    // Replace {{FIGURE:N}} with rendered figures
    const used = new Set<number>();
    content = content.replace(/\{\{FIGURE:(\d+)\}\}/g, (_match, num) => {
      const n = Number(num);
      const fig = figs.find((f) => f.figure_number === n);
      if (fig) { used.add(n); return figureHtml(fig); }
      return `[Figure ${n} not found]`;
    });

    // Append unreferenced figures
    for (const fig of figs) {
      if (!used.has(Number(fig.figure_number))) {
        content += figureHtml(fig);
      }
    }

    return `<div class="section" id="section-${si}">
      <div class="section-title">${esc(String(s.title ?? `Section ${si + 1}`))}</div>
      ${mdToHtml(content)}
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
  <nav id="toc">
    <h3>Contents</h3>
    ${tocLinks}
  </nav>
  <div id="document">
    <div class="cover">
      <h1>${esc(title)}</h1>
      <p class="sub">${esc(sourceNote)}</p>
    </div>
    <div class="toc-page">
      <h2>Table of Contents</h2>
      <ol>${sections.map((s, i) => `<li>${esc(String(s.title ?? `Section ${i + 1}`))}</li>`).join("")}</ol>
    </div>
    <div class="meta">
      <h2>Report Metadata</h2>
      <pre>${esc(JSON.stringify(metadata, null, 2))}</pre>
    </div>
    <div class="meta">
      <h2>Scope &amp; Filters</h2>
      <pre>${esc(JSON.stringify(scope, null, 2))}</pre>
    </div>
    ${sectionHtml}
  </div>
</div>
</body>
</html>`;

  return html;
}
