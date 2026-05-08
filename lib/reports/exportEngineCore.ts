import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  esc,
  nv,
  axisValue,
  kpiValue,
  yAxisTicks,
  parseChart,
  parseTable,
  tableValue,
  svgBar,
  svgLine,
  svgPie,
  svgArea,
  figureHtml,
  looksLikeHtml,
  sanitizeRichHtml,
  inlineMd,
  mdToHtml,
  richTextToHtml,
  plainTextFromMarkdown,
  plainTextFromRichText,
  shortLabel,
} from "@/lib/reports/chartRenderer";
import { renderPdfFromHtml } from "@/lib/reports/pdfRenderer";
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

// These formerly-duplicated helpers are now imported from chartRenderer:
// esc, nv, axisValue, kpiValue, yAxisTicks, parseChart, parseTable,
// tableValue, svgBar, svgLine, svgPie, svgArea, figureHtml,
// looksLikeHtml, sanitizeRichHtml, inlineMd, mdToHtml, richTextToHtml,
// plainTextFromMarkdown, plainTextFromRichText, shortLabel



export function renderInlineSvgForFigure(figure: FigureData): string {
  return figureHtml(figure as unknown as Record<string, unknown>);
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

// NOTE: escapeHtml, markdownToHtml, looksLikeHtml, sanitizeRichHtml, richTextToHtml,
// inlineMarkdown, plainTextFromMarkdown, plainTextFromRichText are now imported from chartRenderer.

export function renderReportHtml(payload: JsonObject, options: ReportExportOptions = {}): string {
  const title = titleFromPayload(payload);
  const sections = asRecordArray(payload.sections);
  const includeCharts = shouldIncludeCharts(options);

  const sectionHtml = sections.map((section) => {
    const content = String(section.content_markdown ?? "");
    let rendered = richTextToHtml(content);

    if (includeCharts) {
      const record = section as Record<string, unknown>;
      const embeddedFigures = Array.isArray(record.embedded_figures) ? record.embedded_figures : [];
      rendered = rendered.replace(/\{\{FIGURE:(\d+)\}\}/g, (_match, num) => {
        const fig = (embeddedFigures as unknown[]).find((f) => {
          const obj = f as Record<string, unknown>;
          return obj.figure_number === Number(num);
        });
        if (fig) return figureHtml(fig as unknown as Record<string, unknown>);
        return `[Figure ${num} not found]`;
      });
    }

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
        rendered += figureHtml(fig as unknown as Record<string, unknown>);
      }
    }

    return `<section>
    <h2>${esc(String(section.title ?? "Untitled section"))}</h2>
    ${rendered}
  </section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
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
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
    .kpi-box { min-width: 0; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: left; background: #f9fafb; overflow: hidden; }
    .kpi-value { font-size: 24px; font-weight: 700; color: #111827; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; }
    .kpi-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 8px; }
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
  <h1>${esc(title)}</h1>
  <h2>Table Of Contents</h2>
  <ol class="toc">
    ${sections.map((section) => `<li>${esc(section.title)}</li>`).join("\n    ")}
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

    let content = plainTextFromRichText(section.content_markdown);
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
  return esc(value).replace(/'/g, "&apos;");
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

// ── Figure → DOCX Image ──────────────────────────────────────────────────────

function figureToSvg(figure: Record<string, unknown>): string {
  const html = figureHtml(figure as Record<string, unknown>);
  const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/);
  return svgMatch ? svgMatch[0] : "";
}

const FIGURE_DIMS: Record<string, { w: number; h: number }> = {
  pie: { w: 540, h: 320 },
  kpi: { w: 540, h: 120 },
  default: { w: 560, h: 340 },
};

function figureDimensions(figure: Record<string, unknown>): { w: number; h: number } {
  const ct = String((figure.visual_config as Record<string, unknown>)?.chartType ?? figure.widget_type ?? "");
  if (ct.includes("pie")) return FIGURE_DIMS.pie;
  if (ct === "kpi") return FIGURE_DIMS.kpi;
  return FIGURE_DIMS.default;
}

async function renderSvgToPng(_svg: string): Promise<Buffer | null> {
  try {
    // Dynamic import — sharp is available via Next.js but may not have librsvg on all platforms
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(_svg)).resize(1120, 680, { fit: "inside" }).png().toBuffer();
    return png;
  } catch {
    return null;
  }
}

async function figureToDocxImage(figure: Record<string, unknown>): Promise<Paragraph> {
  const svg = figureToSvg(figure);
  const figNum = figure.figure_number;
  const title = String(figure.title ?? "Figure");
  const dims = figureDimensions(figure);
  const png = await renderSvgToPng(svg);

  if (!svg) {
    return new Paragraph({
      spacing: { before: 240, after: 80 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `[Figure ${figNum}: ${title} — chart unavailable]`, italics: true, font: "Times New Roman", size: 20 })],
    });
  }

  const fallbackPng = png ?? Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f1f5f9"/><text x="50" y="55" text-anchor="middle" font-size="11" fill="#94a3b8">Chart unavailable</text></svg>'
  );

  return new Paragraph({
    spacing: { before: 240, after: 80 },
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: "svg",
        data: Buffer.from(svg),
        fallback: { type: "png", data: fallbackPng },
        transformation: { width: dims.w, height: dims.h },
      }),
    ],
  });
}

function figureCaptionParagraph(figure: Record<string, unknown>): Paragraph {
  const figNum = figure.figure_number;
  const title = String(figure.title ?? "Figure");
  return new Paragraph({
    spacing: { after: 240 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `Figure ${figNum}: ${title}`, italics: true, font: "Times New Roman", size: 20, color: "#6b7280" })],
  });
}

interface DocxTextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

function parseMarkdownBoldItalic(text: string): DocxTextSegment[] {
  const segments: DocxTextSegment[] = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|([^*]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) {
      segments.push({ text: m[2].trim() ? m[2] : "**", bold: true });
    } else if (m[3] !== undefined) {
      segments.push({ text: m[4].trim() ? m[4] : "*", italic: true });
    } else if (m[5] !== undefined && m[5].trim()) {
      segments.push({ text: m[5] });
    }
  }
  return segments;
}

function docxBoldItalicParagraph(segments: DocxTextSegment[], heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  const runs = segments
    .filter((seg) => seg.text.length > 0)
    .map((seg) => new TextRun({ text: seg.text, bold: seg.bold ?? false, italics: seg.italic ?? false, font: "Times New Roman", size: heading ? 28 : 22 }));
  if (runs.length === 0) {
    runs.push(new TextRun({ text: "", font: "Times New Roman", size: heading ? 28 : 22 }));
  }
  return new Paragraph({
    heading,
    spacing: { after: heading ? 180 : 120 },
    children: runs,
  });
}

function docxContentBlocks(markdown: unknown): Paragraph[] {
  const content = looksLikeHtml(markdown) ? plainTextFromRichText(markdown) : String(markdown ?? "");
  const lines = content.split(/\r?\n/);
  const blocks: Paragraph[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("### ")) {
      blocks.push(docxTextParagraph(line.slice(4).trim(), HeadingLevel.HEADING_3));
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(docxTextParagraph(line.slice(3).trim(), HeadingLevel.HEADING_2));
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(docxTextParagraph(line.slice(2).trim(), HeadingLevel.HEADING_1));
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const bulletText = line.slice(2).trim();
      const segments = parseMarkdownBoldItalic(bulletText);
      if (segments.length > 0) {
        blocks.push(docxBoldItalicParagraph([{ text: "  • " }, ...segments]));
      }
      continue;
    }

    const segments = parseMarkdownBoldItalic(line);
    if (segments.length > 0) {
      blocks.push(docxBoldItalicParagraph(segments));
    }
  }

  return blocks;
}

function isNumericCell(value: unknown): boolean {
  return typeof value === "number" || (typeof value === "string" && /^-?[\d,]+\.?\d*$/.test(value.trim()));
}

function docxTable(title: string, rows: JsonObject[]): (Paragraph | Table)[] {
  if (rows.length === 0) return [docxTextParagraph(title, HeadingLevel.HEADING_3), docxTextParagraph("No tabular data available.")];

  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
  const numericCols = new Set(columns.filter((col) => rows.every((row) => isNumericCell(row[col]))));

  const headerBg = "#2563eb";
  const altRowBg = "#f8fafc";
  const border = { style: BorderStyle.SINGLE, size: 1, color: "#d1d5db" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  return [
    docxTextParagraph(title, HeadingLevel.HEADING_3),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: columns.map((column) => new TableCell({
            borders: cellBorders,
            shading: { type: ShadingType.SOLID, color: headerBg, fill: headerBg },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: column, bold: true, font: "Times New Roman", size: 20, color: "#ffffff" })],
            })],
          })),
        }),
        ...rows.slice(0, 50).map((row, rowIndex) => new TableRow({
          children: columns.map((column) => new TableCell({
            borders: cellBorders,
            shading: rowIndex % 2 === 1 ? { type: ShadingType.SOLID, color: altRowBg, fill: altRowBg } : undefined,
            children: [new Paragraph({
              alignment: numericCols.has(column) ? AlignmentType.RIGHT : AlignmentType.LEFT,
              spacing: { before: 30, after: 30 },
              children: [new TextRun({ text: String(row[column] ?? ""), font: "Times New Roman", size: 20 })],
            })],
          })),
        })),
      ],
    }),
  ];
}

function isChartType(figure: Record<string, unknown>): boolean {
  const ct = String((figure.visual_config as Record<string, unknown>)?.chartType ?? figure.widget_type ?? "");
  return ct.includes("bar") || ct.includes("line") || ct.includes("pie") || ct.includes("area");
}

function isKpiType(figure: Record<string, unknown>): boolean {
  const ct = String((figure.visual_config as Record<string, unknown>)?.chartType ?? figure.widget_type ?? "");
  return ct === "kpi";
}

function kpiDocxBlocks(figure: Record<string, unknown>): Paragraph[] {
  const { rows, yKeys } = parseChart(figure.query_output as JsonObject);
  const row = rows[0];
  const blocks: Paragraph[] = [];

  yKeys.forEach((key, index) => {
    const value = kpiValue(row?.values[index] ?? 0);
    blocks.push(new Paragraph({
      spacing: { before: 80, after: 40 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: key, font: "Times New Roman", size: 18, color: "#6b7280", bold: false }),
        new TextRun({ break: 1 }),
        new TextRun({ text: value.display, font: "Times New Roman", size: 36, bold: true, color: "#0f172a" }),
      ],
    }));
  });

  return [
    new Paragraph({
      spacing: { before: 200, after: 200 },
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: "#2563eb" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "#e2e8f0" } },
      children: [],
    }),
    ...blocks,
    new Paragraph({
      spacing: { before: 80, after: 200 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: "#e2e8f0" } },
      children: [],
    }),
  ];
}

async function renderFigureDocx(figure: Record<string, unknown>): Promise<(Paragraph | Table)[]> {
  // Charts (bar, line, pie, area) → SVG image
  if (isChartType(figure)) {
    const image = await figureToDocxImage(figure);
    return [image, figureCaptionParagraph(figure)];
  }

  // KPIs → styled text blocks
  if (isKpiType(figure)) {
    return [figureCaptionParagraph(figure), ...kpiDocxBlocks(figure)];
  }

  // Tables → professionally styled DOCX table
  const { rows, columns } = parseTable(figure.query_output as JsonObject);
  if (rows.length > 0 && columns.length > 0) {
    return [figureCaptionParagraph(figure), ...docxTable(String(figure.title ?? ""), rows)];
  }

  return [figureCaptionParagraph(figure), docxTextParagraph("No data available for this figure.")];
}

async function renderSectionContentDocx(
  section: Record<string, unknown>,
  embeddedFigures: Record<string, unknown>[],
  includeCharts: boolean
): Promise<(Paragraph | Table)[]> {
  const content = String(section.content_markdown ?? "");
  const children: (Paragraph | Table)[] = [];
  const figureMap = new Map<number, Record<string, unknown>>();
  const referencedNums = new Set<number>();

  if (includeCharts) {
    for (const fig of embeddedFigures) {
      const num = Number(fig.figure_number);
      if (!Number.isNaN(num)) figureMap.set(num, fig);
    }
  }

  // Split content by {{FIGURE:N}} markers and interleave figures
  const parts = content.split(/(\{\{FIGURE:\d+\}\})/g);

  for (const part of parts) {
    const figMatch = part.match(/^\{\{FIGURE:(\d+)\}\}$/);
    if (figMatch) {
      const num = Number(figMatch[1]);
      const figure = figureMap.get(num);
      if (figure) {
        referencedNums.add(num);
        children.push(...await renderFigureDocx(figure));
      } else {
        children.push(docxTextParagraph(`[Figure ${num} — not found]`));
      }
    } else {
      // Render text content with formatting
      children.push(...docxContentBlocks(part));
    }
  }

  // Append unreferenced figures
  if (includeCharts) {
    for (const fig of embeddedFigures) {
      const num = Number(fig.figure_number);
      if (!referencedNums.has(num)) {
        children.push(...await renderFigureDocx(fig));
      }
    }
  }

  return children;
}

export async function renderReportDocx(payload: JsonObject, options: ReportExportOptions = {}): Promise<Uint8Array> {
  const title = titleFromPayload(payload);
  const sections = asRecordArray(payload.sections);
  const includeCharts = shouldIncludeCharts(options);
  const children: (Paragraph | Table | TableOfContents)[] = [
    docxTextParagraph(title, HeadingLevel.TITLE),
    new Paragraph({ children: [new PageBreak()] }),
    docxTextParagraph("Table Of Contents", HeadingLevel.HEADING_1),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  ];

  for (const section of sections) {
    children.push(docxTextParagraph(String(section.title ?? "Untitled section"), HeadingLevel.HEADING_1));

    const record = section as Record<string, unknown>;
    const embeddedFigures = (includeCharts && Array.isArray(record.embedded_figures) ? record.embedded_figures : []) as Record<string, unknown>[];

    const sectionChildren = await renderSectionContentDocx(record, embeddedFigures, includeCharts);
    children.push(...sectionChildren);
  }

  const document = new Document({
    title,
    creator: "Supercoolstuff",
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
  return renderPdfFromHtml(renderReportHtml(payload, options), {
    waitUntil: "load",
    pdf: {
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: "22mm", right: "18mm", bottom: "22mm", left: "18mm" },
      footerTemplate: `<div style="font-family: 'Times New Roman', Times, serif; font-size: 8px; color: #6b7280; width: 100%; padding: 0 18mm; text-align: right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      headerTemplate: `<div></div>`,
    },
  });
}

export function renderReportHtmlArtifact(payload: JsonObject, options: ReportExportOptions = {}): Uint8Array {
  return new TextEncoder().encode(renderReportHtml(payload, options));
}
