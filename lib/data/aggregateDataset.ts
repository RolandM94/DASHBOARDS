import type {
  ActiveGlobalFilters,
  DatasetField,
  Dimension,
  Filter,
  Metric,
  ResolvedChartData,
  SortOrder,
} from "@/types";
import { isNumericType } from "@/types";
import { resolveSmartFilter } from "@/lib/data/smart-filters";
import type { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildCacheKey, getCached, setCache } from "@/lib/data/aggregateCache";
import { evaluateFormula } from "@/lib/data/formulaEvaluator";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface AggregateDatasetInput {
  datasetId: string;
  datasetFields?: DatasetField[];
  metrics: Metric[];
  dimensions: Dimension[];
  worksheetFilters?: Filter[];
  globalFilters?: ActiveGlobalFilters | Record<string, string | string[]>;
  sort?: SortOrder;
  /** Skip cache lookup and always query the database. */
  skipCache?: boolean;
  /** Custom TTL in ms (default 5 minutes). */
  cacheTtlMs?: number;
}

export async function aggregateDataset(
  serviceClient: ServiceClient,
  input: AggregateDatasetInput
): Promise<ResolvedChartData> {
  const {
    datasetId,
    datasetFields: suppliedDatasetFields,
    metrics,
    dimensions,
    worksheetFilters = [],
    globalFilters = {},
    sort = "natural",
    skipCache = false,
    cacheTtlMs,
  } = input;

  let datasetFields = suppliedDatasetFields;
  if (!datasetFields) {
    const { data: dsData } = await serviceClient
      .from("datasets")
      .select("fields")
      .eq("id", datasetId)
      .single();

    datasetFields = (dsData?.fields ?? []) as DatasetField[];
  }
  const fieldTypeMap = Object.fromEntries(datasetFields.map((f) => [f.name, f.type]));
  const baseMetrics = metrics.filter((metric) => metric.aggregation !== "CALCULATED");
  const calculatedMetrics = metrics.filter((metric) => metric.aggregation === "CALCULATED" && metric.formula?.trim());

  const enrichedMetrics: Metric[] = baseMetrics.map((m) => ({
    ...m,
    fieldType: m.fieldType ?? fieldTypeMap[m.field],
  }));

  const smartFilterIds: string[] = [];
  const regularWorksheetFilters: Filter[] = [];
  for (const filter of worksheetFilters) {
    if (filter.field === "_smart" && typeof filter.value === "string") {
      smartFilterIds.push(filter.value);
    } else {
      regularWorksheetFilters.push(filter);
    }
  }

  const smartConditions: string[] = [];
  for (const smartFilterId of smartFilterIds) {
    const condition = resolveSmartFilter(smartFilterId, datasetFields);
    if (condition) smartConditions.push(condition);
  }

  const rpcParams = {
    p_dataset_id: datasetId,
    p_dimensions: dimensions,
    p_metrics: enrichedMetrics,
    p_worksheet_filters: regularWorksheetFilters,
    p_global_filters: globalFilters,
    p_smart_filter_conditions: smartConditions,
    p_sort: sort,
  };

  // ── Cache check ──────────────────────────────────────────────
  if (!skipCache) {
    const cacheKey = buildCacheKey(rpcParams);
    const cached = getCached<ResolvedChartData>(cacheKey);
    if (cached) return cached;
  }

  const { data, error } = await serviceClient.rpc("aggregate_dataset", rpcParams);

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({ ...row }));

  for (const row of rows) {
    for (const metric of enrichedMetrics) {
      if (metric.aggregation === "AVG" && isNumericType(metric.fieldType ?? "decimal") && metric.fieldType === "integer") {
        const value = row[metric.label];
        if (typeof value === "number") row[metric.label] = Math.round(value);
      }
    }
  }

  const yKeys = [...enrichedMetrics.map((metric) => metric.label), ...calculatedMetrics.map((metric) => metric.label)];
  const xKey = dimensions.length === 0
    ? "_label"
    : dimensions.length === 1
    ? dimensions[0].label
    : "_x";

  let chartData: Record<string, unknown>[];
  if (dimensions.length === 0 && rows.length > 0) {
    chartData = [{ ...rows[0], _label: "Total" }];
  } else if (dimensions.length > 1) {
    chartData = rows.map((row) => ({
      ...row,
      _x: dimensions.map((dimension) => row[dimension.label] ?? "").join(" · "),
    }));
  } else {
    chartData = rows;
  }

  for (const metric of calculatedMetrics) {
    for (const row of chartData) {
      row[metric.label] = evaluateFormula(metric.formula!, row);
    }
  }

  const result: ResolvedChartData = {
    data: chartData as ResolvedChartData["data"],
    xKey,
    yKeys,
  };

  // ── Cache store ─────────────────────────────────────────────
  if (!skipCache) {
    const cacheKey = buildCacheKey(rpcParams);
    setCache(cacheKey, result, cacheTtlMs);
  }

  return result;
}

export async function assertDatasetAccess(
  supabase: SupabaseClient,
  datasetId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("datasets")
    .select("id")
    .eq("id", datasetId)
    .single();

  return Boolean(data);
}
