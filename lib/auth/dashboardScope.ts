import type { CanvasBlock, DatasetPreviewBlockConfig, WidgetBlockConfig } from "@/types";
import type { createClient, createServiceClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface DashboardRow {
  id: string;
  canvas_id: string;
  title: string;
  permission: string;
  published_at: string;
  blocks: CanvasBlock[];
  layout: unknown;
}

export interface DashboardWorksheetRow {
  id: string;
  dataset_id: string;
  name: string;
  config: unknown;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardScope {
  dashboard: DashboardRow;
  worksheets: DashboardWorksheetRow[];
  datasetIds: string[];
}

export interface DashboardScopeResult {
  scope?: DashboardScope;
  error?: string;
  status: number;
}

export async function loadDashboardScope(
  supabase: SupabaseClient,
  serviceClient: ServiceClient,
  dashboardId: string
): Promise<DashboardScopeResult> {
  const { data: dashboard, error: dashErr } = await supabase
    .from("dashboards")
    .select("id, canvas_id, title, permission, published_at, blocks, layout")
    .eq("id", dashboardId)
    .single();

  if (dashErr || !dashboard) {
    return { error: "Dashboard not found", status: 404 };
  }

  const blocks = (dashboard.blocks ?? []) as CanvasBlock[];
  const worksheetIds = blocks
    .filter((block): block is WidgetBlockConfig => block.type === "widget")
    .map((block) => block.worksheetId);
  const previewDatasetIds = blocks
    .filter((block): block is DatasetPreviewBlockConfig => block.type === "preview")
    .map((block) => block.datasetId);

  let worksheets: DashboardWorksheetRow[] = [];
  if (worksheetIds.length > 0) {
    const { data, error } = await serviceClient
      .from("worksheets")
      .select("id, dataset_id, name, config, status, created_at, updated_at")
      .in("id", worksheetIds);

    if (error) {
      return { error: error.message, status: 500 };
    }
    worksheets = (data ?? []) as DashboardWorksheetRow[];
  }

  const datasetIds = Array.from(new Set([
    ...worksheets.map((worksheet) => worksheet.dataset_id),
    ...previewDatasetIds,
  ]));

  return {
    status: 200,
    scope: {
      dashboard: dashboard as DashboardRow,
      worksheets,
      datasetIds,
    },
  };
}

export function scopeContainsDataset(scope: DashboardScope, datasetId: string): boolean {
  return scope.datasetIds.includes(datasetId);
}
