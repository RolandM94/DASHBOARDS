import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import {
  REPORT_COMPILATION_COLUMNS,
  REPORT_EXPORT_COLUMNS,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import { dbToReportExport } from "@/lib/reports/models";
import {
  assertReportExportAllowed,
  markReportExported,
} from "@/lib/reports/approvalWorkflow";
import {
  artifactMetadata,
  asRecord,
  asRecordArray,
  renderReportDocx,
  renderReportHtmlArtifact,
  renderReportPdf,
  shouldIncludeAppendix,
  titleFromPayload,
  type JsonObject,
  type ReportExportArtifact,
  type ReportExportOptions,
} from "@/lib/reports/exportEngineCore";
import type { ReportExport, ReportExportFormat } from "@/types";

interface CompilationRow {
  id: string;
  report_project_id: string;
  report_blueprint_id?: string | null;
  source_snapshot_id?: string | null;
  title: string;
  compiled_payload: JsonObject;
  status: string;
  compiled_by?: string | null;
  created_at: string;
  updated_at: string;
}

interface ExportRow {
  id: string;
  report_project_id: string;
  report_blueprint_id?: string | null;
  format: ReportExportFormat;
  file_url?: string | null;
  file_path?: string | null;
  export_config: JsonObject;
  status: string;
  exported_by?: string | null;
  exported_at?: string | null;
  created_at: string;
}

export interface ExportReportRequest {
  format: ReportExportFormat;
  exportOptions?: ReportExportOptions;
  compilationId?: string;
  exportedBy?: string;
}

export interface ExportReportResult {
  exportRecord: ReportExport;
  artifact: {
    filename: string;
    contentType: string;
    extension: string;
    downloadUrl: string;
    compilationId: string;
  };
}

async function getCompilation(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  compilationId?: string
): Promise<CompilationRow> {
  let query = supabase
    .from("report_compilations")
    .select(REPORT_COMPILATION_COLUMNS)
    .eq("report_project_id", reportProjectId);

  if (compilationId) {
    query = query.eq("id", compilationId);
  } else {
    query = query.eq("status", "compiled").order("created_at", { ascending: false }).limit(1);
  }

  const { data, error } = await query.single();
  if (error || !data) throw new Error("Compiled report not found. Compile the report before exporting.");
  return data as CompilationRow;
}

function sheetName(value: string, fallback: string): string {
  return (value || fallback).replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || fallback;
}

function rowsFromSourceTable(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  const rows = record.rows;
  if (Array.isArray(rows)) {
    return rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }
  if (Array.isArray(value)) {
    return value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }
  return [];
}

function rowsToSheetData(rows: Record<string, unknown>[]): SheetData {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.map((header) => ({ value: header, fontWeight: "bold" as const })),
    ...rows.map((row) => headers.map((header) => {
      const value = row[header];
      if (value instanceof Date) return value;
      if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
      return value === undefined || value === null ? "" : JSON.stringify(value);
    })),
  ];
}

function plainText(value: unknown): string {
  const raw = String(value ?? "");
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/gi, "")
    .replace(/\{\{FIGURE:\d+\}\}/g, (match) => `[${match.slice(2, -2)}]`)
    .trim();
}

async function renderExcel(payload: JsonObject): Promise<Uint8Array> {
  const metadataRows = Object.entries(asRecord(payload.metadata)).map(([key, value]) => ({
    key,
    value: typeof value === "object" ? JSON.stringify(value) : value,
  }));

  const filters = asRecord(asRecord(payload.scope).active_filters);
  const sheets = [
    {
      sheet: sheetName("Metadata", "Metadata"),
      data: rowsToSheetData(metadataRows),
    },
    {
      sheet: sheetName("Filters", "Filters"),
      data: rowsToSheetData(Object.entries(filters).map(([key, value]) => ({ key, value: JSON.stringify(value) }))),
    },
  ];

  const sections = asRecordArray(payload.sections);

  // Report Narrative sheet
  const narrativeRows: Record<string, unknown>[] = [];
  for (const section of sections) {
    narrativeRows.push({
      key: "",
      value: `──── ${String(section.title ?? "Untitled section").toUpperCase()} ────`,
    });
    const sectionContent = plainText(section.content_markdown);
    for (const line of sectionContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed) {
        narrativeRows.push({ key: "", value: trimmed.slice(0, 2000) });
      }
    }
    narrativeRows.push({ key: "", value: "" });
  }
  if (narrativeRows.length > 0) {
    sheets.push({
      sheet: sheetName("Report Narrative", "Narrative"),
      data: rowsToSheetData(narrativeRows),
    });
  }

  const chartsFigures = asRecordArray(payload.sections)
    .flatMap((section: Record<string, unknown>) => {
      const figs = Array.isArray(section.embedded_figures) ? section.embedded_figures : [];
      return figs as Array<Record<string, unknown>>;
    });

  chartsFigures.forEach((figure: Record<string, unknown>) => {
    const rows = rowsFromSourceTable(figure.query_output);
    const fallbackRows = rows.length > 0 ? rows : [{ note: "No tabular source data available for this widget." }];
    const figureNum = figure.figure_number;
    const figureTitle = String(figure.title ?? "Figure");
    sheets.push({
      sheet: sheetName(`Figure ${figureNum} — ${figureTitle}`, `Widget ${sheets.length + 1}`),
      data: rowsToSheetData(fallbackRows),
    });
  });

  const warnings = [
    ...asRecordArray(payload.warnings).map((warning) => ({ warning: JSON.stringify(warning) })),
    ...asRecordArray(payload.appendices)
      .filter((appendix) => appendix.type === "data_quality_warnings")
      .flatMap((appendix) => asRecordArray(appendix.content).map((warning) => ({ warning: JSON.stringify(warning) }))),
  ];
  sheets.push({
    sheet: sheetName("Warnings", "Warnings"),
    data: rowsToSheetData(warnings.length > 0 ? warnings : [{ warning: "No data quality warnings recorded." }]),
  });

  const output = await writeXlsxFile(sheets).toBuffer();
  return new Uint8Array(output);
}

export async function renderExportArtifact(
  format: ReportExportFormat,
  payload: JsonObject,
  options: ReportExportOptions = {}
): Promise<ReportExportArtifact> {
  const metadata = artifactMetadata(format, titleFromPayload(payload));

  if (format === "docx") {
    return { ...metadata, bytes: await renderReportDocx(payload, options) };
  }
  if (format === "pdf") {
    return { ...metadata, bytes: await renderReportPdf(payload, options) };
  }
  if (format === "excel") {
    return { ...metadata, bytes: await renderExcel({
      ...payload,
      appendices: shouldIncludeAppendix(options) ? payload.appendices : [],
    }) };
  }
  return { ...metadata, bytes: renderReportHtmlArtifact(payload, options) };
}

export async function exportReport(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  request: ExportReportRequest
): Promise<ExportReportResult> {
  if (request.exportedBy) {
    await assertReportExportAllowed(supabase, reportProjectId, request.exportedBy);
  }

  const compilation = await getCompilation(supabase, reportProjectId, request.compilationId);
  const payload = asRecord(compilation.compiled_payload);
  const metadata = artifactMetadata(request.format, titleFromPayload(payload));

  const { data, error } = await supabase
    .from("report_exports")
    .insert({
      report_project_id: reportProjectId,
      report_blueprint_id: compilation.report_blueprint_id ?? null,
      format: request.format,
      file_url: null,
      file_path: `report-exports/pending.${metadata.extension}`,
      export_config: {
        ...(request.exportOptions ?? {}),
        compilation_id: compilation.id,
        source_snapshot_id: compilation.source_snapshot_id ?? null,
        filename: metadata.filename,
        content_type: metadata.contentType,
        generated_on_download: true,
      },
      status: "exported",
      exported_by: request.exportedBy ?? null,
      exported_at: new Date().toISOString(),
    })
    .select(REPORT_EXPORT_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Report export could not be stored");

  const downloadUrl = `/api/reports/exports/${data.id}/download`;
  const { data: updated, error: updateError } = await supabase
    .from("report_exports")
    .update({
      file_url: downloadUrl,
      file_path: `report-exports/${data.id}.${metadata.extension}`,
      export_config: {
        ...(data.export_config ?? {}),
        download_url: downloadUrl,
      },
    })
    .eq("id", data.id)
    .select(REPORT_EXPORT_COLUMNS)
    .single();

  if (updateError || !updated) throw new Error(updateError?.message ?? "Report export download link could not be stored");

  await markReportExported(supabase, reportProjectId);

  return {
    exportRecord: dbToReportExport(updated),
    artifact: {
      filename: metadata.filename,
      contentType: metadata.contentType,
      extension: metadata.extension,
      downloadUrl,
      compilationId: compilation.id,
    },
  };
}

export async function renderExportDownload(
  supabase: SupabaseRouteClient,
  exportId: string
): Promise<{ exportRecord: ReportExport; artifact: ReportExportArtifact }> {
  const { data: exportRow, error } = await supabase
    .from("report_exports")
    .select(REPORT_EXPORT_COLUMNS)
    .eq("id", exportId)
    .single();

  if (error || !exportRow) throw new Error("Report export not found");

  const row = exportRow as ExportRow;
  if (row.status !== "exported") throw new Error("Report export is not ready for download");

  const config = asRecord(row.export_config);
  const compilationId = typeof config.compilation_id === "string" ? config.compilation_id : undefined;
  if (!compilationId) throw new Error("Report export is missing compilation metadata");

  const { data: compilation, error: compilationError } = await supabase
    .from("report_compilations")
    .select(REPORT_COMPILATION_COLUMNS)
    .eq("id", compilationId)
    .eq("report_project_id", row.report_project_id)
    .single();

  if (compilationError || !compilation) throw new Error("Compiled report not found for this export");

  return {
    exportRecord: dbToReportExport(row as unknown as Record<string, unknown>),
    artifact: await renderExportArtifact(row.format, asRecord((compilation as CompilationRow).compiled_payload), config),
  };
}
