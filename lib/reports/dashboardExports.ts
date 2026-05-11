import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import { loadDashboardScope, type DashboardScope, type DashboardWorksheetRow } from "@/lib/auth/dashboardScope";
import { getWorkbookSheet } from "@/lib/workbook";
import { renderDashboardPdfHtml } from "@/lib/reports/dashboardPdfHtml";
import {
  aggregateDashboardPdfWidgets,
  fetchDashboardDatasetFields,
  fetchDashboardPdfPreviewRows,
} from "@/lib/reports/dashboardPdfData";
import { renderPdfFromHtml } from "@/lib/reports/pdfRenderer";
import type { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  DatasetPreviewBlockConfig,
  GridLayoutItem,
  WidgetBlockConfig,
  Worksheet,
  WorksheetStatus,
} from "@/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface DashboardExportArtifact {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

const permissionLabel: Record<string, string> = {
  private: "Private",
  org: "Organisation",
  public: "Public",
};

function toWorksheet(row: DashboardWorksheetRow): Worksheet {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    name: row.name,
    description: row.description ?? undefined,
    config: row.config as Worksheet["config"],
    status: (row.status as WorksheetStatus) ?? "saved",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "-").trim() || "dashboard";
}

function rowsToSheetData(rows: Record<string, unknown>[]): SheetData {
  const fallback = rows.length > 0 ? rows : [{ note: "No rows available." }];
  const headers = Array.from(new Set(fallback.flatMap((row) => Object.keys(row))));
  return [
    headers.map((header) => ({ value: header, fontWeight: "bold" as const })),
    ...fallback.map((row) => headers.map((header) => {
      const value = row[header];
      if (value instanceof Date) return value;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      return value == null ? "" : JSON.stringify(value);
    })),
  ];
}

function sheetName(value: string, fallback: string): string {
  return (value || fallback).replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || fallback;
}

export async function collectDashboardExportData(serviceClient: ServiceClient, scope: DashboardScope) {
  const widgetBlocks = scope.dashboard.blocks.filter(
    (block): block is WidgetBlockConfig => block.type === "widget"
  );
  const previewBlocks = scope.dashboard.blocks.filter(
    (block): block is DatasetPreviewBlockConfig => block.type === "preview"
  );
  const datasetFieldsById = await fetchDashboardDatasetFields(serviceClient, scope.datasetIds);
  const aggregateResults = await aggregateDashboardPdfWidgets({
    serviceClient,
    widgetBlocks,
    worksheets: scope.worksheets,
    extraFilters: [],
    smartFilters: [],
    cleanGlobalFilters: {},
    datasetFieldsById,
  });
  const previewResults = await fetchDashboardPdfPreviewRows(serviceClient, previewBlocks);

  return { widgetBlocks, previewBlocks, aggregateResults, previewResults };
}

export async function loadScheduledDashboardScope(
  serviceClient: ServiceClient,
  dashboardId: string
): Promise<DashboardScope> {
  const { scope, error } = await loadDashboardScope(serviceClient as unknown as SupabaseClient, serviceClient, dashboardId);
  if (!scope) throw new Error(error ?? "Dashboard not found");
  return scope;
}

export async function renderDashboardPdfExport(serviceClient: ServiceClient, scope: DashboardScope): Promise<DashboardExportArtifact> {
  const { aggregateResults, previewResults } = await collectDashboardExportData(serviceClient, scope);
  const layout = (scope.dashboard.layout as GridLayoutItem[] | undefined) ?? [];

  const blocks = scope.dashboard.blocks
    .map((block) => {
      const pos = layout.find((item) => item.i === block.id);
      if (block.type === "text") {
        return {
          id: block.id,
          x: pos?.x ?? 0,
          y: pos?.y ?? 0,
          w: pos?.w ?? 12,
          h: pos?.h ?? 4,
          type: "text" as const,
          content: block.content,
        };
      }
      if (block.type === "preview") {
        const rows = previewResults.find((result) => result.blockId === block.id)?.rows ?? [];
        return {
          id: block.id,
          x: pos?.x ?? 0,
          y: pos?.y ?? 0,
          w: pos?.w ?? 12,
          h: pos?.h ?? 10,
          type: "preview" as const,
          title: "Dataset Preview",
          columns: Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
          previewRows: rows,
        };
      }
      if (block.type === "widget") {
        const result = aggregateResults.find((item) => item.blockId === block.id);
        const worksheetRow = scope.worksheets.find((worksheet) => worksheet.id === block.worksheetId);
        const worksheet = worksheetRow ? toWorksheet(worksheetRow) : undefined;
        const sheet = worksheet ? getWorkbookSheet(worksheet, block.sheetId) : undefined;
        const chartData = result?.data;
        return {
          id: block.id,
          x: pos?.x ?? 0,
          y: pos?.y ?? 0,
          w: pos?.w ?? 6,
          h: pos?.h ?? 14,
          type: "widget" as const,
          title: block.title ?? sheet?.name ?? worksheet?.name ?? "Widget",
          chartType: sheet?.chartType ?? "bar",
          figure: chartData ? {
            query_output: {
              rows: chartData.data,
              columns: [chartData.xKey, ...chartData.yKeys],
              y_keys: chartData.yKeys,
              x_key: chartData.xKey,
            },
          } : undefined,
          logScale: sheet?.logScale ?? false,
        };
      }
      return null;
    })
    .filter(Boolean) as Parameters<typeof renderDashboardPdfHtml>[0]["blocks"];

  const html = renderDashboardPdfHtml({
    header: {
      title: scope.dashboard.title,
      permissionLabel: permissionLabel[scope.dashboard.permission] ?? "Private",
      publishedDate: new Date(scope.dashboard.published_at).toLocaleDateString(),
      generatedDate: new Date().toLocaleDateString(),
    },
    blocks,
    activeFilters: [],
  });

  const pdf = await renderPdfFromHtml(html, {
    waitUntil: "load",
    pdf: {
      format: "A4",
      landscape: true,
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: "16mm", right: "10mm", bottom: "16mm", left: "10mm" },
      headerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:left;">${scope.dashboard.title}</div>`,
      footerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    },
  });

  return {
    bytes: pdf,
    filename: `${sanitizeFilename(scope.dashboard.title)}.pdf`,
    contentType: "application/pdf",
  };
}

export async function renderDashboardXlsxExport(serviceClient: ServiceClient, scope: DashboardScope): Promise<DashboardExportArtifact> {
  const { aggregateResults, previewResults } = await collectDashboardExportData(serviceClient, scope);
  const sheets: Array<{ sheet: string; data: SheetData }> = [
    {
      sheet: "Dashboard",
      data: rowsToSheetData([
        { key: "Title", value: scope.dashboard.title },
        { key: "Permission", value: permissionLabel[scope.dashboard.permission] ?? "Private" },
        { key: "Published", value: scope.dashboard.published_at },
        { key: "Generated", value: new Date().toISOString() },
      ]),
    },
  ];

  for (const result of aggregateResults) {
    const block = scope.dashboard.blocks.find((item) => item.id === result.blockId) as WidgetBlockConfig | undefined;
    const worksheetRow = block ? scope.worksheets.find((worksheet) => worksheet.id === block.worksheetId) : undefined;
    const worksheet = worksheetRow ? toWorksheet(worksheetRow) : undefined;
    const sheet = worksheet && block ? getWorkbookSheet(worksheet, block.sheetId) : undefined;
    const title = block?.title ?? sheet?.name ?? worksheet?.name ?? "Widget";
    sheets.push({
      sheet: sheetName(title, `Widget ${sheets.length}`),
      data: rowsToSheetData(result.data?.data ?? []),
    });
  }

  for (const preview of previewResults) {
    sheets.push({
      sheet: sheetName("Dataset Preview", `Preview ${sheets.length}`),
      data: rowsToSheetData(preview.rows),
    });
  }

  const output = await writeXlsxFile(sheets).toBuffer();
  return {
    bytes: new Uint8Array(output),
    filename: `${sanitizeFilename(scope.dashboard.title)}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
