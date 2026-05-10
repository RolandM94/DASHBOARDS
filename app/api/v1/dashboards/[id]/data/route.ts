/**
 * GET /api/v1/dashboards/[id]/data
 *
 * Returns a dashboard's widget data as JSON.
 * Authentication: Bearer token (API key) or Supabase session.
 *
 * Response:
 * {
 *   dashboard: { id, title, permission, publishedAt },
 *   widgets: [{ id, title, chartType, data, xKey, yKeys }],
 *   worksheets: [{ id, name }],
 *   activeFilters: {}, // always empty — use query params: ?filter_field=value
 * }
 *
 * Example:
 *   curl -H "Authorization: Bearer sc_abc123..." \
 *     https://supercool-stuff.vercel.app/api/v1/dashboards/d-123/data
 */
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, type DashboardWorksheetRow } from "@/lib/auth/dashboardScope";
import { aggregateDataset } from "@/lib/data/aggregateDataset";
import { authenticateApiKey } from "@/lib/data/apiAuth";
import { getWorkbookSheet } from "@/lib/workbook";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { CanvasBlock, WidgetBlockConfig, Metric, Dimension, ResolvedChartData, Worksheet, WorksheetStatus } from "@/types";

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  // Try API key auth first, then fall back to session auth
  const apiAuth = await authenticateApiKey(request);
  if (!apiAuth) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required. Provide an API key via Authorization: Bearer <key>" }, { status: 401 });
    }
  } else if (!apiAuth.scopes.some((scope) => scope === "read" || scope === "admin")) {
    return NextResponse.json({ error: "API key does not have read scope" }, { status: 403 });
  }

  const { scope, error, status } = apiAuth
    ? await loadApiKeyDashboardScope(serviceClient, id, apiAuth.userId)
    : await loadDashboardScope(supabase, serviceClient, id);
  if (!scope) return NextResponse.json({ error }, { status });

  const dashboardBlocks = scope.dashboard.blocks as CanvasBlock[];
  const widgetBlocks = dashboardBlocks.filter(
    (b): b is WidgetBlockConfig => b.type === "widget",
  );

  const widgets: Array<{
    id: string;
    title: string;
    chartType: string;
    data: ResolvedChartData | null;
  }> = [];

  await Promise.all(
    widgetBlocks.map(async (block) => {
      try {
        const worksheetRow = scope.worksheets.find((w) => w.id === block.worksheetId);
        if (!worksheetRow) return;

        const worksheet = toWorksheet(worksheetRow);
        const sheet = getWorkbookSheet(worksheet, block.sheetId);
        if (!sheet) return;

        const chartData = await aggregateDataset(serviceClient, {
          datasetId: worksheet.datasetId,
          metrics: sheet.metrics as Metric[],
          dimensions: sheet.dimensions as Dimension[],
          worksheetFilters: sheet.filters ?? [],
          sort: sheet.sort ?? "natural",
        });

        widgets.push({
          id: block.id,
          title: block.title ?? sheet.name ?? worksheet.name ?? "Widget",
          chartType: sheet.chartType ?? "bar",
          data: chartData,
        });
      } catch { /* skip failed widgets */ }
    }),
  );

  const worksheets = scope.worksheets.map((w) => ({ id: w.id, name: w.name }));

  return NextResponse.json({
    dashboard: {
      id: scope.dashboard.id,
      title: scope.dashboard.title,
      permission: scope.dashboard.permission,
      publishedAt: scope.dashboard.published_at,
    },
    widgets,
    worksheets,
  });
}

async function loadApiKeyDashboardScope(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  dashboardId: string,
  userId: string,
) {
  const { data: dashboard, error: dashErr } = await serviceClient
    .from("dashboards")
    .select("id, canvas_id, title, permission, published_at, blocks, layout, user_id")
    .eq("id", dashboardId)
    .single();

  if (dashErr || !dashboard || dashboard.user_id !== userId) {
    return { error: "Dashboard not found", status: 404 };
  }

  const blocks = (dashboard.blocks ?? []) as CanvasBlock[];
  const worksheetIds = Array.from(new Set(
    blocks
      .filter((block): block is WidgetBlockConfig => block.type === "widget")
      .map((block) => block.worksheetId),
  ));

  let worksheets: DashboardWorksheetRow[] = [];
  if (worksheetIds.length > 0) {
    const { data, error } = await serviceClient
      .from("worksheets")
      .select("id, dataset_id, name, description, config, status, created_at, updated_at")
      .in("id", worksheetIds);

    if (error) return { error: error.message, status: 500 };
    worksheets = (data ?? []) as DashboardWorksheetRow[];
  }

  return {
    status: 200,
    scope: {
      dashboard: {
        id: dashboard.id,
        canvas_id: dashboard.canvas_id,
        title: dashboard.title,
        permission: dashboard.permission,
        published_at: dashboard.published_at,
        blocks: dashboard.blocks,
        layout: dashboard.layout,
      },
      worksheets,
      datasetIds: Array.from(new Set(worksheets.map((worksheet) => worksheet.dataset_id))),
    },
  };
}
