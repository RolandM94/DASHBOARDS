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

function renderFigureDocxImage(figure: FigureData): string {
  const { rows, yKeys } = parseChart(figure.query_output);
  const value = rows.length > 0 && yKeys.length > 0 ? rows[0].values[0] : 0;
  const label = yKeys[0] ?? "Value";

  return `<w:p>
    <w:pPr><w:pStyle w:val="Caption"/></w:pPr>
    <w:r><w:t xml:space="preserve">Figure ${figure.figure_number}: ${xmlEscape(figure.title)} \u2014 ${value.toLocaleString()} ${xmlEscape(label)}</w:t></w:r>
  </w:p>`;
}

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
  const allFigures = includeCharts ? collectFigures(sections) : [];

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

function docxMarkdown(markdown: unknown): Paragraph[] {
  const content = looksLikeHtml(markdown) ? plainTextFromRichText(markdown) : String(markdown ?? "");
  return content
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
        const { rows, columns } = parseTable(f.query_output);
        const headerColumns = columns.slice(0, 8);
        children.push(new Paragraph({
          spacing: { before: 240 },
          children: [new TextRun({ text: `Figure ${f.figure_number}: ${f.title}`, italics: true, font: "Times New Roman", size: 22 })],
        }));
        if (rows.length > 0 && headerColumns.length > 0) {
          children.push(...docxTable(f.title, rows));
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
