import type {
  WorksheetConfig,
  DatasetField,
  AggregationFn,
  ChartType,
  SortOrder,
} from "@/types";
import type { AIDatasetField } from "@/lib/ai/prompts";

const VALID_CHART_TYPES = new Set<ChartType>([
  "bar", "grouped_bar", "line", "area", "pie", "kpi", "table", "map",
]);

const VALID_AGG_FNS = new Set<AggregationFn>([
  "SUM", "COUNT", "AVG", "MIN", "MAX",
]);

const VALID_SORT_ORDERS = new Set<SortOrder>([
  "natural", "value_asc", "value_desc",
  "top_5", "top_10", "top_20",
  "alpha_asc", "alpha_desc",
]);

/**
 * Sanitises and validates an AI-generated WorksheetConfig against the actual
 * field list for the chosen dataset.
 *
 * All fixes are silent — the route logs validation warnings separately.
 * The returned config is always safe to persist.
 */
export function sanitiseConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>,
  fields: AIDatasetField[] | DatasetField[],
  options: { prompt?: string } = {},
): WorksheetConfig {
  const fieldNames = new Set(fields.map((f) => f.name));
  const fieldMeta = new Map(fields.map((f) => [f.name, f as AIDatasetField]));
  const prompt = options.prompt?.toLowerCase() ?? "";
  const asksForLimit = /\b(top|bottom|highest|lowest|largest|smallest|best|worst|first|limit|rank|ranking)\b|\btop\s*\d+\b|\b\d+\s+(ministries|mdas|agencies|sectors|items|categories)\b/.test(prompt);
  const asksForFull = /\b(all|full|every|each|entire|complete|whole)\b/.test(prompt);
  const asksForPie = /\b(pie|donut|doughnut)\b/.test(prompt);

  // ── Chart type ────────────────────────────────────────────────────────────
  let chartType: ChartType =
    VALID_CHART_TYPES.has(raw.chartType) ? raw.chartType : "bar";

  // ── Dimensions — drop unknowns ────────────────────────────────────────────
  let dimensions: WorksheetConfig["dimensions"] = (
    Array.isArray(raw.dimensions) ? raw.dimensions : []
  )
    .filter((d: { field?: string }) => d?.field && fieldNames.has(d.field))
    .map((d: { id?: string; field: string; label?: string }) => ({
      id:    d.id    ?? `d${Math.random().toString(36).slice(2, 6)}`,
      field: d.field,
      label: d.label ?? d.field,
    }));

  // ── Metrics — drop unknowns, fix bad aggregations ─────────────────────────
  let metrics: WorksheetConfig["metrics"] = (
    Array.isArray(raw.metrics) ? raw.metrics : []
  )
    .filter((m: { field?: string }) => m?.field && fieldNames.has(m.field))
    .map((m: { id?: string; field: string; aggregation?: string; label?: string }) => {
      const agg = String(m.aggregation ?? "").toUpperCase() as AggregationFn;
      return {
        id:          m.id ?? `m${Math.random().toString(36).slice(2, 6)}`,
        field:       m.field,
        aggregation: VALID_AGG_FNS.has(agg) ? agg : "SUM",
        label:       m.label ?? `${agg} of ${m.field}`,
      };
    });

  // ── Chart-specific structural rules ───────────────────────────────────────
  if (chartType === "kpi") {
    // KPI: no dimensions, 1–4 metrics
    dimensions = [];
    if (metrics.length === 0) metrics = [];   // caller handles empty gracefully
    metrics = metrics.slice(0, 4);
  }

  if (chartType === "pie" || chartType === "map") {
    // Exactly 1 dimension + 1 metric
    dimensions = dimensions.slice(0, 1);
    metrics    = metrics.slice(0, 1);

    const primaryDimension = dimensions[0];
    const distinctCount = primaryDimension
      ? fieldMeta.get(primaryDimension.field)?.distinctCount
      : undefined;
    if (
      chartType === "pie" &&
      typeof distinctCount === "number" &&
      distinctCount > 8 &&
      !asksForPie
    ) {
      chartType = "bar";
    }
  }

  if (chartType === "grouped_bar") {
    // Exactly 1 dimension + ≥ 2 metrics
    dimensions = dimensions.slice(0, 1);
    if (metrics.length < 2) {
      // Not enough metrics — fall back to a regular bar chart
      return sanitiseConfig({ ...raw, chartType: "bar" }, fields, options);
    }
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  const rawSort: SortOrder = VALID_SORT_ORDERS.has(raw.sort) ? raw.sort : "natural";
  const isTopSort = rawSort === "top_5" || rawSort === "top_10" || rawSort === "top_20";
  const sort: SortOrder = isTopSort && (!asksForLimit || asksForFull)
    ? "value_desc"
    : rawSort;

  return {
    chartType,
    dimensions,
    metrics,
    filters:  [],           // AI-generated filters not yet supported in MVP
    sort,
    logScale: Boolean(raw.logScale),
  };
}
