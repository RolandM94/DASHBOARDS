import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, type DashboardWorksheetRow } from "@/lib/auth/dashboardScope";
import { aggregateDataset } from "@/lib/data/aggregateDataset";
import { getWorkbookSheet } from "@/lib/workbook";
import { NextResponse } from "next/server";
import type { WidgetBlockConfig, Metric, Dimension, ResolvedChartData, Worksheet, WorksheetStatus } from "@/types";
import { buildCacheKey, getCached, setCache } from "@/lib/data/aggregateCache";

const LIVE_CACHE_TTL = 5 * 60 * 1000;

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, id);
  if (!scope) return NextResponse.json({ error }, { status });

  const dashboard = scope.dashboard;

  // Check cache
  const cacheKey = buildCacheKey({ _live: id });
  const cached = getCached<{
    dashboard: Record<string, unknown>;
    worksheets: Record<string, unknown>[];
    datasets: Record<string, unknown>[];
    widgetData: Record<string, ResolvedChartData | null>;
  }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Fetch datasets
  const widgetBlocks = dashboard.blocks.filter(
    (b): b is WidgetBlockConfig => b.type === "widget",
  );
  const datasetIds = Array.from(new Set(
    widgetBlocks
      .map((b) => scope.worksheets.find((w) => w.id === b.worksheetId))
      .filter(Boolean)
      .map((w) => w!.dataset_id),
  ));

  let datasets: Record<string, unknown>[] = [];
  if (datasetIds.length > 0) {
    const { data: dsRows } = await serviceClient
      .from("datasets")
      .select("id, file_name, uploaded_at, fields, row_count")
      .in("id", datasetIds);
    datasets = (dsRows ?? []).map((d) => ({
      id: d.id,
      fileName: d.file_name,
      uploadedAt: d.uploaded_at,
      fields: d.fields,
      rowCount: d.row_count,
    }));
  }

  // Fetch aggregate data for all widget blocks in parallel
  const widgetData: Record<string, ResolvedChartData | null> = {};
  await Promise.all(
    widgetBlocks.map(async (block) => {
      try {
        const worksheetRow = scope.worksheets.find((w) => w.id === block.worksheetId);
        if (!worksheetRow) { widgetData[block.id] = null; return; }

        const worksheet = toWorksheet(worksheetRow);
        const sheet = getWorkbookSheet(worksheet, block.sheetId);
        if (!sheet) { widgetData[block.id] = null; return; }

        const data = await aggregateDataset(serviceClient, {
          datasetId: worksheet.datasetId,
          metrics: sheet.metrics as Metric[],
          dimensions: sheet.dimensions as Dimension[],
          worksheetFilters: sheet.filters ?? [],
          sort: sheet.sort ?? "natural",
          cacheTtlMs: LIVE_CACHE_TTL,
        });

        widgetData[block.id] = data;
      } catch {
        widgetData[block.id] = null;
      }
    }),
  );

  const mappedWorksheets = scope.worksheets.map((w) => ({
    id: w.id,
    datasetId: w.dataset_id,
    name: w.name,
    description: w.description ?? undefined,
    config: w.config,
    status: w.status,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }));

  const result = {
    dashboard: {
      id: dashboard.id,
      canvasId: dashboard.canvas_id,
      title: dashboard.title,
      permission: dashboard.permission,
      publishedAt: dashboard.published_at,
      blocks: dashboard.blocks,
      layout: dashboard.layout,
    },
    worksheets: mappedWorksheets,
    datasets,
    widgetData,
  };

  setCache(cacheKey, result, LIVE_CACHE_TTL);

  return NextResponse.json(result);
}
