// ── Pure HTML Preview Renderer (no Playwright, no docx) ──────────────────────
// Used for live in-browser preview of the compiled report

import {
  esc,
  figureHtml,
  richTextToHtml,
} from "@/lib/reports/chartRenderer";

type JsonObject = Record<string, unknown>;
type R = Record<string, unknown>;

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
.report-figure { margin: 28px 0; text-align: center; }
.report-figure figcaption { font-size: 11px; color: #94a3b8; margin-top: 8px; font-style: italic; }
.report-fig { margin: 28px 0; text-align: center; }
.report-fig figcaption { font-size: 11px; color: #94a3b8; margin-top: 8px; font-style: italic; }
.chart-svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
.chart-placeholder { color: #94a3b8; font-style: italic; text-align: center; padding: 32px; }
.chart-na { color: #94a3b8; font-style: italic; text-align: center; padding: 32px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
.kpi-box { min-width: 0; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: left; background: #f8fafc; overflow: hidden; }
.kpi-value { font-size: 24px; font-weight: 800; color: #0f172a; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; }
.kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
.kpi-val { font-size: 24px; font-weight: 800; color: #0f172a; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; }
.kpi-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
.figure-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 16px 0; }
.figure-table th { background: #f1f5f9; text-align: left; padding: 6px 12px; border: 1px solid #e2e8f0; }
.figure-table td { padding: 5px 12px; border: 1px solid #e2e8f0; }
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

  const sectionHtml = sections.map((s, si) => {
    let content = String(s.content_markdown ?? "");
    const figs = Array.isArray(s.embedded_figures) ? s.embedded_figures as R[] : [];
    const figureTokens = new Map<string, string>();

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

  return `<!doctype html>
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
}
