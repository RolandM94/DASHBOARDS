import { loadDashboardScope } from "@/lib/auth/dashboardScope";
import { aggregateDataset } from "@/lib/data/aggregateDataset";
import { splitFiltersForApi } from "@/lib/data/filters";
import { getWorkbookSheet } from "@/lib/workbook";
import type { SupabaseRouteClient } from "@/lib/reports/api";
import type {
  ActiveGlobalFilters,
  ActiveSmartFilters,
  CanvasBlock,
  DashboardPermission,
  Filter,
  GridLayoutItem,
  PublishedDashboard,
  ResolvedChartData,
  TextBlockConfig,
  WidgetBlockConfig,
  Worksheet,
} from "@/types";

export interface ReportSourceReaderOptions {
  activeFilters?: ActiveGlobalFilters;
  activeSmartFilters?: ActiveSmartFilters;
}

export interface ReportSourceWarning {
  blockId?: string;
  worksheetId?: string;
  message: string;
}

export interface ReportSourceWidget {
  id: string;
  title: string;
  type: string;
  worksheet_id: string;
  sheet_id?: string;
  visual_config: Record<string, unknown>;
  query_output?: {
    x_key: string;
    y_keys: string[];
    columns: string[];
    rows: ResolvedChartData["data"];
  };
  insights: ReportSourceInsight[];
  layout?: GridLayoutItem;
  order_index: number;
}

export interface ReportSourceInsight {
  id: string;
  content: string;
  worksheet_id?: string;
  sheet_id?: string;
  order_index: number;
}

export interface ReportSourceTextBlock {
  id: string;
  content: string;
  order_index: number;
  layout?: GridLayoutItem;
}

export interface ReportSourceFilterBlock {
  id: string;
  field: string;
  filter_type: string;
  label: string;
  order_index: number;
  layout?: GridLayoutItem;
}

export interface ReportSourceWorksheet {
  id: string;
  dataset_id: string;
  name: string;
  description?: string;
  config: unknown;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReportSourcePackage {
  source: {
    type: "dashboard" | "canvas";
    id: string;
    title: string;
    description?: string;
    canvas_id?: string;
    permission?: DashboardPermission | string;
    published_at?: string;
  };
  active_filters: ActiveGlobalFilters;
  active_smart_filters: ActiveSmartFilters;
  widgets: ReportSourceWidget[];
  worksheets: ReportSourceWorksheet[];
  text_blocks: ReportSourceTextBlock[];
  filter_blocks: ReportSourceFilterBlock[];
  insights: ReportSourceInsight[];
  query_outputs: Record<string, ReportSourceWidget["query_output"]>;
  warnings: ReportSourceWarning[];
  metadata: {
    captured_at: string;
    widget_count: number;
    worksheet_count: number;
    insight_count: number;
    text_block_count: number;
    filter_count: number;
    failed_widgets: number;
  };
}

interface CanvasRow {
  id: string;
  name: string;
  blocks: CanvasBlock[];
  layout?: GridLayoutItem[] | null;
  published?: boolean;
  published_title?: string | null;
  published_permission?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ReportProjectRow {
  id: string;
  source_type: "dashboard" | "canvas";
  source_dashboard_id?: string | null;
  source_canvas_id?: string | null;
}

function smartFiltersForApi(activeSmartFilters: ActiveSmartFilters): Filter[] {
  return activeSmartFilters.map((id) => ({
    id: `smart-${id}`,
    field: "_smart",
    operator: "equals",
    value: id,
    label: "Smart Filter",
  }));
}

function layoutMap(layout: unknown): Map<string, GridLayoutItem> {
  if (!Array.isArray(layout)) return new Map();
  return new Map(
    layout
      .filter((item): item is GridLayoutItem => Boolean(item && typeof item === "object" && "i" in item))
      .map((item) => [item.i, item])
  );
}

function orderedBlocks(blocks: CanvasBlock[], layout: unknown): Array<{ block: CanvasBlock; layout?: GridLayoutItem; orderIndex: number }> {
  const byId = layoutMap(layout);
  return blocks
    .map((block, index) => ({
      block,
      layout: byId.get(block.id),
      orderIndex: typeof block.order === "number" ? block.order : index,
    }))
    .sort((a, b) => {
      if (a.layout && b.layout) {
        if (a.layout.y !== b.layout.y) return a.layout.y - b.layout.y;
        if (a.layout.x !== b.layout.x) return a.layout.x - b.layout.x;
      }
      if (a.layout && !b.layout) return -1;
      if (!a.layout && b.layout) return 1;
      return a.orderIndex - b.orderIndex;
    });
}

function worksheetFromRow(row: ReportSourceWorksheet): Worksheet {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    name: row.name,
    description: row.description,
    config: row.config as Worksheet["config"],
    status: row.status as Worksheet["status"],
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function normalizeWorksheetRow(row: Record<string, unknown>): ReportSourceWorksheet {
  return {
    id: String(row.id),
    dataset_id: String(row.dataset_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    config: row.config,
    status: String(row.status),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function queryOutputFromChartData(chartData: ResolvedChartData): ReportSourceWidget["query_output"] {
  return {
    x_key: chartData.xKey,
    y_keys: chartData.yKeys,
    columns: Array.from(new Set([chartData.xKey, ...chartData.yKeys])),
    rows: chartData.data,
  };
}

async function readBlocksForReport(
  serviceClient: SupabaseRouteClient,
  blocks: CanvasBlock[],
  layout: unknown,
  worksheets: ReportSourceWorksheet[],
  options: ReportSourceReaderOptions,
  dashboardId?: string
): Promise<Omit<ReportSourcePackage, "source" | "active_filters" | "active_smart_filters" | "metadata">> {
  const worksheetById = new Map(worksheets.map((worksheet) => [worksheet.id, worksheet]));
  const ordered = orderedBlocks(blocks, layout);
  const textBlocks: ReportSourceTextBlock[] = [];
  const filterBlocks: ReportSourceFilterBlock[] = [];
  const insights: ReportSourceInsight[] = [];

  for (const { block, layout: itemLayout, orderIndex } of ordered) {
    if (block.type === "text") {
      const textBlock = block as TextBlockConfig;
      if (textBlock.worksheetId) {
        insights.push({
          id: textBlock.id,
          content: textBlock.content,
          worksheet_id: textBlock.worksheetId,
          sheet_id: textBlock.sheetId,
          order_index: orderIndex,
        });
      } else {
        textBlocks.push({
          id: textBlock.id,
          content: textBlock.content,
          order_index: orderIndex,
          layout: itemLayout,
        });
      }
    }

    if (block.type === "filter") {
      filterBlocks.push({
        id: block.id,
        field: block.field,
        filter_type: block.filterType,
        label: block.label,
        order_index: orderIndex,
        layout: itemLayout,
      });
    }
  }

  const widgets: ReportSourceWidget[] = [];
  const warnings: ReportSourceWarning[] = [];
  const queryOutputs: Record<string, ReportSourceWidget["query_output"]> = {};
  const { cleanGlobalFilters, extraFilters } = splitFiltersForApi(options.activeFilters ?? {});
  const smartFilters = smartFiltersForApi(options.activeSmartFilters ?? []);

  for (const { block, layout: itemLayout, orderIndex } of ordered) {
    if (block.type !== "widget") continue;

    const widget = block as WidgetBlockConfig;
    const worksheetRow = worksheetById.get(widget.worksheetId);
    if (!worksheetRow) {
      warnings.push({
        blockId: widget.id,
        worksheetId: widget.worksheetId,
        message: "Linked worksheet was not found or could not be read.",
      });
      widgets.push({
        id: widget.id,
        title: widget.title ?? "Untitled widget",
        type: "unknown",
        worksheet_id: widget.worksheetId,
        sheet_id: widget.sheetId,
        visual_config: {},
        insights: [],
        layout: itemLayout,
        order_index: orderIndex,
      });
      continue;
    }

    const worksheet = worksheetFromRow(worksheetRow);
    const sheet = getWorkbookSheet(worksheet, widget.sheetId);
    const widgetInsights = insights.filter((insight) =>
      insight.worksheet_id === widget.worksheetId &&
      (insight.sheet_id ? insight.sheet_id === sheet.id : true)
    );

    let queryOutput: ReportSourceWidget["query_output"];
    if (sheet.metrics.length === 0) {
      warnings.push({
        blockId: widget.id,
        worksheetId: widget.worksheetId,
        message: "Widget has no metrics configured, so no query output was captured.",
      });
    } else {
      try {
        const chartData = await aggregateDataset(serviceClient, {
          datasetId: worksheet.datasetId,
          metrics: sheet.metrics,
          dimensions: sheet.dimensions,
          worksheetFilters: [...(sheet.filters ?? []), ...extraFilters, ...smartFilters],
          globalFilters: cleanGlobalFilters,
          sort: sheet.sort ?? "natural",
        });
        queryOutput = queryOutputFromChartData(chartData);
        queryOutputs[widget.id] = queryOutput;
      } catch (error) {
        warnings.push({
          blockId: widget.id,
          worksheetId: widget.worksheetId,
          message: error instanceof Error ? error.message : "Widget query output could not be captured.",
        });
      }
    }

    widgets.push({
      id: widget.id,
      title: widget.title ?? sheet.name ?? worksheet.name,
      type: sheet.chartType,
      worksheet_id: widget.worksheetId,
      sheet_id: sheet.id,
      visual_config: {
        chartType: sheet.chartType,
        metrics: sheet.metrics,
        dimensions: sheet.dimensions,
        filters: sheet.filters ?? [],
        sort: sheet.sort ?? "natural",
        logScale: sheet.logScale ?? false,
        dashboardId,
      },
      query_output: queryOutput,
      insights: widgetInsights,
      layout: itemLayout,
      order_index: orderIndex,
    });
  }

  return {
    widgets,
    worksheets,
    text_blocks: textBlocks,
    filter_blocks: filterBlocks,
    insights,
    query_outputs: queryOutputs,
    warnings,
  };
}

async function loadWorksheets(
  serviceClient: SupabaseRouteClient,
  worksheetIds: string[]
): Promise<ReportSourceWorksheet[]> {
  const uniqueIds = Array.from(new Set(worksheetIds));
  if (uniqueIds.length === 0) return [];

  const { data, error } = await serviceClient
    .from("worksheets")
    .select("id, dataset_id, name, description, config, status, created_at, updated_at")
    .in("id", uniqueIds);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeWorksheetRow(row));
}

export async function readCanvasForReport(
  supabase: SupabaseRouteClient,
  serviceClient: SupabaseRouteClient,
  canvasId: string,
  options: ReportSourceReaderOptions = {}
): Promise<ReportSourcePackage> {
  const { data: canvas, error } = await supabase
    .from("canvases")
    .select("id, name, blocks, layout, published, published_title, published_permission, published_at, created_at, updated_at")
    .eq("id", canvasId)
    .single();

  if (error || !canvas) throw new Error("Canvas not found or access denied");

  const canvasRow = canvas as CanvasRow;
  const blocks = (canvasRow.blocks ?? []) as CanvasBlock[];
  const worksheetIds = blocks
    .filter((block): block is WidgetBlockConfig => block.type === "widget")
    .map((block) => block.worksheetId);
  const worksheets = await loadWorksheets(serviceClient, worksheetIds);
  const captured = await readBlocksForReport(serviceClient, blocks, canvasRow.layout, worksheets, options);

  return withMetadata({
    source: {
      type: "canvas",
      id: canvasRow.id,
      title: canvasRow.name,
      permission: canvasRow.published_permission ?? undefined,
      published_at: canvasRow.published_at ?? undefined,
    },
    active_filters: options.activeFilters ?? {},
    active_smart_filters: options.activeSmartFilters ?? [],
    ...captured,
  });
}

export async function readDashboardForReport(
  supabase: SupabaseRouteClient,
  serviceClient: SupabaseRouteClient,
  dashboardId: string,
  options: ReportSourceReaderOptions = {}
): Promise<ReportSourcePackage> {
  const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, dashboardId);
  if (!scope) throw new Error(error ?? `Dashboard could not be read (${status})`);

  const dashboard = scope.dashboard as PublishedDashboard & {
    permission?: string;
    published_at?: string;
    canvas_id?: string;
  };
  const blocks = (dashboard.blocks ?? []) as CanvasBlock[];
  const worksheets = scope.worksheets.map((worksheet) => normalizeWorksheetRow(worksheet as unknown as Record<string, unknown>));
  const captured = await readBlocksForReport(serviceClient, blocks, dashboard.layout, worksheets, options, dashboardId);

  return withMetadata({
    source: {
      type: "dashboard",
      id: dashboard.id,
      canvas_id: dashboard.canvas_id,
      title: dashboard.title,
      permission: dashboard.permission,
      published_at: dashboard.published_at,
    },
    active_filters: options.activeFilters ?? {},
    active_smart_filters: options.activeSmartFilters ?? [],
    ...captured,
  });
}

function withMetadata(sourcePackage: Omit<ReportSourcePackage, "metadata">): ReportSourcePackage {
  return {
    ...sourcePackage,
    metadata: {
      captured_at: new Date().toISOString(),
      widget_count: sourcePackage.widgets.length,
      worksheet_count: sourcePackage.worksheets.length,
      insight_count: sourcePackage.insights.length,
      text_block_count: sourcePackage.text_blocks.length,
      filter_count: sourcePackage.filter_blocks.length,
      failed_widgets: sourcePackage.warnings.filter((warning) => warning.blockId).length,
    },
  };
}

export async function captureReportSource(
  supabase: SupabaseRouteClient,
  serviceClient: SupabaseRouteClient,
  reportProjectId: string,
  options: ReportSourceReaderOptions = {}
): Promise<{ snapshotId: string; sourcePackage: ReportSourcePackage }> {
  const { data: project, error } = await supabase
    .from("report_projects")
    .select("id, source_type, source_dashboard_id, source_canvas_id")
    .eq("id", reportProjectId)
    .single();

  if (error || !project) throw new Error("Report project not found");

  const projectRow = project as ReportProjectRow;
  const sourcePackage = projectRow.source_type === "dashboard"
    ? await readDashboardForReport(supabase, serviceClient, String(projectRow.source_dashboard_id), options)
    : await readCanvasForReport(supabase, serviceClient, String(projectRow.source_canvas_id), options);

  const { data: snapshot, error: snapshotError } = await supabase
    .from("report_source_snapshots")
    .insert({
      report_project_id: reportProjectId,
      source_type: sourcePackage.source.type,
      source_id: sourcePackage.source.id,
      active_filters_snapshot: {
        filters: sourcePackage.active_filters,
        smart_filters: sourcePackage.active_smart_filters,
      },
      widgets_snapshot: sourcePackage.widgets,
      worksheets_snapshot: sourcePackage.worksheets,
      insights_snapshot: sourcePackage.insights,
      query_outputs_snapshot: sourcePackage.query_outputs,
      metadata: {
        source: sourcePackage.source,
        text_blocks: sourcePackage.text_blocks,
        filter_blocks: sourcePackage.filter_blocks,
        warnings: sourcePackage.warnings,
        ...sourcePackage.metadata,
      },
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    throw new Error(snapshotError?.message ?? "Source snapshot could not be stored");
  }

  return {
    snapshotId: String(snapshot.id),
    sourcePackage,
  };
}
