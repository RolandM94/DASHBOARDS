import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, type DashboardWorksheetRow } from "@/lib/auth/dashboardScope";
import { aggregateDataset } from "@/lib/data/aggregateDataset";
import { splitFiltersForApi, decodeFiltersParam, hasActiveFilterValue } from "@/lib/data/filters";
import { getWorkbookSheet } from "@/lib/workbook";
import { renderDashboardPdfHtml } from "@/lib/reports/dashboardPdfHtml";
import { topNWithOthers } from "@/lib/reports/topNOthers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type {
  WidgetBlockConfig,
  Filter,
  Metric,
  Dimension,
  ResolvedChartData,
  GridLayoutItem,
  Worksheet,
  WorksheetStatus,
  ActiveSmartFilters,
  DatasetPreviewBlockConfig,
} from "@/types";
import sparticuzChromium from "@sparticuz/chromium";
import { chromium } from "playwright-core";

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
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  // 1. Load dashboard scope (permission-aware)
  const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, id);
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

  const aggregateResults = await Promise.all(
    widgetBlocks.map(async (block) => {
      try {
        const worksheetRow = scope.worksheets.find((w) => w.id === block.worksheetId);
        if (!worksheetRow) return { blockId: block.id, data: null as ResolvedChartData | null };

        const worksheet = toWorksheet(worksheetRow);
        const sheet = getWorkbookSheet(worksheet, block.sheetId);
        if (!sheet) return { blockId: block.id, data: null as ResolvedChartData | null };

        const combinedFilters: Filter[] = [...(sheet.filters ?? []), ...extraFilters, ...smartFilters];

        const data = await aggregateDataset(serviceClient, {
          datasetId: worksheet.datasetId,
          metrics: sheet.metrics as Metric[],
          dimensions: sheet.dimensions as Dimension[],
          worksheetFilters: combinedFilters,
          globalFilters: cleanGlobalFilters,
          sort: sheet.sort ?? "natural",
        });

        return { blockId: block.id, data };
      } catch {
        return { blockId: block.id, data: null as ResolvedChartData | null };
      }
    }),
  );

  // 5. Apply top-10 + others for widgets with >10 data points
  const TOP_N = 10;
  for (const result of aggregateResults) {
    if (!result.data || result.data.data.length <= TOP_N) continue;

    const block = widgetBlocks.find((b) => b.id === result.blockId);
    if (!block) continue;

    const worksheetRow = scope.worksheets.find((w) => w.id === block.worksheetId);
    if (!worksheetRow) continue;

    const worksheet = toWorksheet(worksheetRow);
    const sheet = getWorkbookSheet(worksheet, block.sheetId);
    if (!sheet || sheet.metrics.length === 0 || sheet.dimensions.length === 0) continue;

    const primaryMetric = sheet.metrics[0].label;
    const primaryDim = sheet.dimensions[0].label;

    const trimmed = topNWithOthers(result.data.data, primaryMetric, primaryDim, TOP_N);
    result.data = { ...result.data, data: trimmed as ResolvedChartData["data"] };
  }

  // 6. Fetch dataset preview rows for preview blocks.
  const previewBlocks = dashboard.blocks.filter(
    (block): block is DatasetPreviewBlockConfig => block.type === "preview",
  );
  const previewResults = await Promise.all(
    previewBlocks.map(async (block) => {
      try {
        const limit = Math.min(block.rowLimit ?? 10, 1000);
        const { data, error: rowsError } = await serviceClient
          .from("dataset_rows")
          .select("data")
          .eq("dataset_id", block.datasetId)
          .order("row_index", { ascending: true })
          .limit(limit);

        if (rowsError) return { blockId: block.id, rows: [] as Record<string, unknown>[] };
        return {
          blockId: block.id,
          rows: (data ?? []).map((row) => row.data as Record<string, unknown>),
        };
      } catch {
        return { blockId: block.id, rows: [] as Record<string, unknown>[] };
      }
    }),
  );

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
  const html = renderDashboardPdfHtml({
    header: {
      title: dashboard.title,
      permissionLabel: permissionLabel[dashboard.permission] ?? "Private",
      publishedDate: new Date(dashboard.published_at).toLocaleDateString(),
      generatedDate: new Date().toLocaleDateString(),
    },
    blocks,
    activeFilters: filterSummary,
  });

  // 9. Render PDF with Playwright/Chromium
  try {
    const isLinux = process.platform === "linux";
    const launchOptions = isLinux
      ? {
          args: sparticuzChromium.args,
          executablePath: await sparticuzChromium.executablePath(),
          headless: sparticuzChromium.headless,
        }
      : { headless: true as const };

    const browser = await chromium.launch(launchOptions);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        margin: { top: "16mm", right: "10mm", bottom: "16mm", left: "10mm" },
        headerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:left;">${dashboard.title}</div>`,
        footerTemplate: `<div style="font-size:8px;color:#6b7280;padding:0 10mm;width:100%;text-align:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      });

      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sanitizeFilename(dashboard.title)}.pdf"`,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF generation failed" },
      { status: 500 },
    );
  }
}
