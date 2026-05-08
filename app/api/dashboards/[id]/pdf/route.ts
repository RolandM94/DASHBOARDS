import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, type DashboardWorksheetRow } from "@/lib/auth/dashboardScope";
import { splitFiltersForApi, decodeFiltersParam, hasActiveFilterValue } from "@/lib/data/filters";
import { getWorkbookSheet } from "@/lib/workbook";
import { renderDashboardPdfHtml } from "@/lib/reports/dashboardPdfHtml";
import {
  aggregateDashboardPdfWidgets,
  fetchDashboardDatasetFields,
  fetchDashboardPdfPreviewRows,
} from "@/lib/reports/dashboardPdfData";
import { renderPdfFromHtml } from "@/lib/reports/pdfRenderer";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type {
  WidgetBlockConfig,
  Filter,
  GridLayoutItem,
  Worksheet,
  WorksheetStatus,
  ActiveSmartFilters,
  DatasetPreviewBlockConfig,
} from "@/types";

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

export const maxDuration = 60;
export const runtime = "nodejs";

const permissionLabel: Record<string, string> = {
  private: "Private",
  org: "Organisation",
  public: "Public",
};

function smartFiltersForApi(activeSmartFilters: ActiveSmartFilters): Filter[] {
  return activeSmartFilters.map((id) => ({
    id: `smart-${id}`,
    field: "_smart",
    operator: "equals",
    value: id,
    label: "Smart Filter",
  }));
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "-").trim() || "dashboard";
}

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("min" in record || "max" in record) {
      const min = record.min === undefined ? "any" : String(record.min);
      const max = record.max === undefined ? "any" : String(record.max);
      return `${min} to ${max}`;
    }
    if ("from" in record || "to" in record) {
      const from = record.from === undefined ? "any" : String(record.from);
      const to = record.to === undefined ? "any" : String(record.to);
      return `${from} to ${to}`;
    }
  }
  return String(value);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const timings: Record<string, number> = {};
  const time = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await fn();
    } finally {
      timings[name] = Math.round(performance.now() - started);
    }
  };
  const logTimings = (status: "success" | "error") => {
    console.info("[dashboard-pdf] export timings", { dashboardId: id, status, timings });
  };

  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  // 1. Load dashboard scope (permission-aware)
  const { scope, error, status } = await time("scopeLoad", () => loadDashboardScope(supabase, serviceClient, id));
  if (!scope) return NextResponse.json({ error }, { status });

  const dashboard = scope.dashboard;

  // 2. Parse filters from query params
  const { searchParams } = new URL(request.url);
  const rawFiltersParam = searchParams.get("filters");
  const rawSmartFilters = searchParams.get("smartFilters");

  const activeFilters = decodeFiltersParam(rawFiltersParam);
  let smartFilterIds: string[] = [];
  if (rawSmartFilters) {
    try {
      const parsed = JSON.parse(rawSmartFilters);
      if (Array.isArray(parsed)) smartFilterIds = parsed.filter((id: unknown) => typeof id === "string");
    } catch { /* ignore */ }
  }

  const { cleanGlobalFilters, extraFilters } = splitFiltersForApi(activeFilters);
  const smartFilters = smartFiltersForApi(smartFilterIds);

  // 3. Build filter summary for the PDF header
  const filterSummary = Object.entries(activeFilters)
    .filter(([, v]) => hasActiveFilterValue(v))
    .map(([field, value]) => ({
      label: field,
      values: formatFilterValue(value),
    }));

  if (smartFilterIds.length > 0) {
    filterSummary.push({
      label: "Smart filters",
      values: smartFilterIds.join(", "),
    });
  }

  // 4. Fetch aggregate data for all widget blocks in parallel
  const widgetBlocks = dashboard.blocks.filter(
    (b): b is WidgetBlockConfig => b.type === "widget",
  );

  const datasetFieldsById = await time("datasetFieldsLoad", () =>
    fetchDashboardDatasetFields(serviceClient, scope.datasetIds)
  );
  const aggregateResults = await time("aggregateData", () =>
    aggregateDashboardPdfWidgets({
      serviceClient,
      widgetBlocks,
      worksheets: scope.worksheets,
      extraFilters,
      smartFilters,
      cleanGlobalFilters,
      datasetFieldsById,
    })
  );

  // 6. Fetch dataset preview rows for preview blocks.
  const previewBlocks = dashboard.blocks.filter(
    (block): block is DatasetPreviewBlockConfig => block.type === "preview",
  );
  const previewResults = await time("previewRows", () => fetchDashboardPdfPreviewRows(serviceClient, previewBlocks));

  // 7. Build blocks for the PDF HTML renderer
  const layout = (scope.dashboard.layout as GridLayoutItem[] | undefined) ?? [];

  const blocks = scope.dashboard.blocks
    .map((block) => {
      const pos = layout.find((l: GridLayoutItem) => l.i === block.id);

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
        const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
        return {
          id: block.id,
          x: pos?.x ?? 0,
          y: pos?.y ?? 0,
          w: pos?.w ?? 12,
          h: pos?.h ?? 10,
          type: "preview" as const,
          title: "Dataset Preview",
          columns,
          previewRows: rows,
        };
      }

      if (block.type === "widget") {
        const result = aggregateResults.find((r) => r.blockId === block.id);
        const worksheetRow = scope.worksheets.find((w) => w.id === block.worksheetId);
        const worksheet = worksheetRow ? toWorksheet(worksheetRow) : undefined;
        const sheet = worksheet ? getWorkbookSheet(worksheet, block.sheetId) : undefined;

        const chartData = result?.data;
        const figure = chartData ? {
          query_output: {
            rows: chartData.data,
            columns: [chartData.xKey, ...chartData.yKeys],
            y_keys: chartData.yKeys,
            x_key: chartData.xKey,
          },
        } : undefined;

        return {
          id: block.id,
          x: pos?.x ?? 0,
          y: pos?.y ?? 0,
          w: pos?.w ?? 6,
          h: pos?.h ?? 14,
          type: "widget" as const,
          title: block.title ?? sheet?.name ?? worksheet?.name ?? "Widget",
          chartType: sheet?.chartType ?? "bar",
          figure,
          logScale: sheet?.logScale ?? false,
        };
      }

      return null;
    })
    .filter(Boolean) as Array<{
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      type: "widget" | "text" | "preview";
      title?: string;
      chartType?: string;
      figure?: Record<string, unknown>;
      logScale?: boolean;
      content?: string;
      columns?: string[];
      previewRows?: Array<Record<string, unknown>>;
    }>;

  // 8. Generate PDF HTML
  const html = await time("htmlRender", async () => renderDashboardPdfHtml({
    header: {
      title: dashboard.title,
      permissionLabel: permissionLabel[dashboard.permission] ?? "Private",
      publishedDate: new Date(dashboard.published_at).toLocaleDateString(),
      generatedDate: new Date().toLocaleDateString(),
    },
    blocks,
    activeFilters: filterSummary,
  }));

  // 9. Render PDF with Playwright/Chromium
  try {
    const pdf = await renderPdfFromHtml(html, {
      waitUntil: "load",
      onTiming: (stage, ms) => {
        timings[stage] = Math.round(ms);
      },
      pdf: {
        format: "A4",
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        margin: { top: "16mm", right: "10mm", bottom: "16mm", left: "10mm" },
        headerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:left;">${dashboard.title}</div>`,
        footerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      },
    });

    logTimings("success");
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizeFilename(dashboard.title)}.pdf"`,
      },
    });
  } catch (err) {
    logTimings("error");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF generation failed" },
      { status: 500 },
    );
  }
}
