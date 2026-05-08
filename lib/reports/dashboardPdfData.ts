import type { DashboardWorksheetRow } from "@/lib/auth/dashboardScope";
import { aggregateDataset, type AggregateDatasetInput } from "@/lib/data/aggregateDataset";
import { getWorkbookSheet } from "@/lib/workbook";
import { topNWithOthers } from "@/lib/reports/topNOthers";
import type { createServiceClient } from "@/lib/supabase/server";
import type {
  ActiveGlobalFilters,
  DatasetField,
  DatasetPreviewBlockConfig,
  Dimension,
  Filter,
  Metric,
  ResolvedChartData,
  WidgetBlockConfig,
  Worksheet,
  WorksheetStatus,
} from "@/types";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export const DASHBOARD_PDF_PREVIEW_ROW_LIMIT = 30;
const DASHBOARD_PDF_TOP_N = 10;

export interface WidgetAggregateResult {
  blockId: string;
  data: ResolvedChartData | null;
}

export interface PreviewRowsResult {
  blockId: string;
  rows: Record<string, unknown>[];
}

type AggregateFn = (
  serviceClient: ServiceClient,
  input: AggregateDatasetInput,
) => Promise<ResolvedChartData>;

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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function fetchDashboardDatasetFields(
  serviceClient: ServiceClient,
  datasetIds: string[],
): Promise<Map<string, DatasetField[]>> {
  const uniqueIds = Array.from(new Set(datasetIds));
  if (uniqueIds.length === 0) return new Map();

  const { data } = await serviceClient
    .from("datasets")
    .select("id, fields")
    .in("id", uniqueIds);

  return new Map(
    (data ?? []).map((row) => [
      String(row.id),
      (row.fields ?? []) as DatasetField[],
    ]),
  );
}

export async function aggregateDashboardPdfWidgets({
  serviceClient,
  widgetBlocks,
  worksheets,
  extraFilters,
  smartFilters,
  cleanGlobalFilters,
  datasetFieldsById,
  aggregate = aggregateDataset,
}: {
  serviceClient: ServiceClient;
  widgetBlocks: WidgetBlockConfig[];
  worksheets: DashboardWorksheetRow[];
  extraFilters: Filter[];
  smartFilters: Filter[];
  cleanGlobalFilters: ActiveGlobalFilters | Record<string, string | string[]>;
  datasetFieldsById: Map<string, DatasetField[]>;
  aggregate?: AggregateFn;
}): Promise<WidgetAggregateResult[]> {
  const aggregatePromises = new Map<string, Promise<ResolvedChartData>>();

  const results = await Promise.all(
    widgetBlocks.map(async (block) => {
      try {
        const worksheetRow = worksheets.find((w) => w.id === block.worksheetId);
        if (!worksheetRow) return { blockId: block.id, data: null };

        const worksheet = toWorksheet(worksheetRow);
        const sheet = getWorkbookSheet(worksheet, block.sheetId);
        if (!sheet) return { blockId: block.id, data: null };

        const combinedFilters: Filter[] = [...(sheet.filters ?? []), ...extraFilters, ...smartFilters];
        const input: AggregateDatasetInput = {
          datasetId: worksheet.datasetId,
          datasetFields: datasetFieldsById.get(worksheet.datasetId),
          metrics: sheet.metrics as Metric[],
          dimensions: sheet.dimensions as Dimension[],
          worksheetFilters: combinedFilters,
          globalFilters: cleanGlobalFilters,
          sort: sheet.sort ?? "natural",
        };
        const key = stableStringify({
          datasetId: input.datasetId,
          metrics: input.metrics,
          dimensions: input.dimensions,
          worksheetFilters: input.worksheetFilters,
          globalFilters: input.globalFilters,
          sort: input.sort,
        });

        let promise = aggregatePromises.get(key);
        if (!promise) {
          promise = aggregate(serviceClient, input);
          aggregatePromises.set(key, promise);
        }

        const data = await promise;
        return { blockId: block.id, data };
      } catch {
        return { blockId: block.id, data: null };
      }
    }),
  );

  for (const result of results) {
    if (!result.data || result.data.data.length <= DASHBOARD_PDF_TOP_N) continue;

    const block = widgetBlocks.find((b) => b.id === result.blockId);
    if (!block) continue;

    const worksheetRow = worksheets.find((w) => w.id === block.worksheetId);
    if (!worksheetRow) continue;

    const worksheet = toWorksheet(worksheetRow);
    const sheet = getWorkbookSheet(worksheet, block.sheetId);
    if (!sheet || sheet.metrics.length === 0 || sheet.dimensions.length === 0) continue;

    const primaryMetric = sheet.metrics[0].label;
    const primaryDim = sheet.dimensions[0].label;
    const trimmed = topNWithOthers(result.data.data, primaryMetric, primaryDim, DASHBOARD_PDF_TOP_N);
    result.data = { ...result.data, data: trimmed as ResolvedChartData["data"] };
  }

  return results;
}

export async function fetchDashboardPdfPreviewRows(
  serviceClient: ServiceClient,
  previewBlocks: DatasetPreviewBlockConfig[],
): Promise<PreviewRowsResult[]> {
  return Promise.all(
    previewBlocks.map(async (block) => {
      try {
        const requestedLimit = block.rowLimit ?? 10;
        const limit = Math.min(requestedLimit, DASHBOARD_PDF_PREVIEW_ROW_LIMIT);
        const { data, error: rowsError } = await serviceClient
          .from("dataset_rows")
          .select("data")
          .eq("dataset_id", block.datasetId)
          .order("row_index", { ascending: true })
          .limit(limit);

        if (rowsError) return { blockId: block.id, rows: [] };
        return {
          blockId: block.id,
          rows: (data ?? []).map((row) => row.data as Record<string, unknown>),
        };
      } catch {
        return { blockId: block.id, rows: [] };
      }
    }),
  );
}
