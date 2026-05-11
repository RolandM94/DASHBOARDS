import type {
  WorksheetConfig,
  DatasetField,
  AggregationFn,
  ChartType,
  SortOrder,
  FilterOperator,
} from "@/types";
import { isNumericType } from "@/types";
import type { AIDatasetField } from "@/lib/ai/prompts";
import { isValidSmartFilterId } from "@/lib/data/smart-filters";

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

const VALID_FILTER_OPS = new Set<FilterOperator>([
  "equals", "not_equals", "contains", "in", "gt", "gte", "lt", "lte",
]);

export interface SanitisedAISheet {
  title: string;
  description: string;
  insight: string;
  config: WorksheetConfig;
}

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
      const safeAgg = VALID_AGG_FNS.has(agg) ? agg : "SUM";
      return {
        id:          m.id ?? `m${Math.random().toString(36).slice(2, 6)}`,
        field:       m.field,
        aggregation: safeAgg,
        label:       m.label ?? `${safeAgg} of ${m.field}`,
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

  // ── Filters ────────────────────────────────────────────────────────────────
  let filters: WorksheetConfig["filters"] = (
    Array.isArray(raw.filters) ? raw.filters : []
  )
    .filter((f: { field?: string; operator?: string }) => {
      // Must have a valid field and operator
      return f?.field
        && (fieldNames.has(f.field) || f.field === "_smart")
        && typeof f.operator === "string"
        && VALID_FILTER_OPS.has(f.operator as FilterOperator);
    })
    .map((f: { id?: string; field: string; operator: FilterOperator; value: unknown; label?: string }) => {
      const op = f.operator;
      const fieldDef = fieldMeta.get(f.field);
      let value: string | string[] | number = f.value as string;

      // Smart filter pseudo-field — keep value as string (the smart filter ID)
      if (f.field === "_smart") {
        value = String(f.value ?? "");
        return {
          id:    f.id ?? `f${Math.random().toString(36).slice(2, 6)}`,
          field: f.field,
          operator: op,
          value,
          label: f.label ?? "Smart Filter",
        };
      }

      // Coerce value based on operator and field type
      if (op === "in") {
        value = Array.isArray(f.value) ? f.value.map(String) : [String(f.value)];
      } else if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
        value = typeof f.value === "number" ? f.value : Number(f.value);
      } else {
        // equals, not_equals, contains — coerce to number if the field is numeric
        value = fieldDef && isNumericType(fieldDef.type)
          ? (typeof f.value === "number" ? f.value : Number(f.value))
          : String(f.value ?? "");
      }

      return {
        id:    f.id ?? `f${Math.random().toString(36).slice(2, 6)}`,
        field: f.field,
        operator: op,
        value,
        label: f.label ?? f.field,
      };
    });

  // Deduplicate on field+operator+JSON(value)
  const seenFilters = new Set<string>();
  filters = filters.filter((f) => {
    const key = `${f.field}|${f.operator}|${JSON.stringify(f.value)}`;
    if (seenFilters.has(key)) return false;
    seenFilters.add(key);
    return true;
  });

  // Drop unknown smart filter IDs
  filters = filters.filter((f) => {
    if (f.field !== "_smart") return true;
    return typeof f.value === "string" && isValidSmartFilterId(f.value, fields);
  });

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
    filters,
    sort,
    logScale: Boolean(raw.logScale),
  };
}

export function sanitiseGeneratedSheets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>,
  fields: AIDatasetField[] | DatasetField[],
  options: { prompt?: string } = {},
): SanitisedAISheet[] {
  const sourceSheets = Array.isArray(raw.sheets) && raw.sheets.length > 0
    ? raw.sheets.slice(0, 6)
    : [raw];

  const seenSignatures = new Set<string>();

  const sheets = sourceSheets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((sheet: Record<string, any>, index: number): SanitisedAISheet => {
      const config = sanitiseConfig(sheet, fields, options);
      return {
        title: String(sheet.title ?? sheet.name ?? (index === 0 ? raw.title : `Sheet ${index + 1}`) ?? `Sheet ${index + 1}`),
        description: String(sheet.description ?? ""),
        insight: String(sheet.insight ?? ""),
        config,
      };
    })
    .filter((sheet) => {
      const signature = JSON.stringify({
        chartType: sheet.config.chartType,
        dimensions: sheet.config.dimensions.map((d) => d.field),
        metrics: sheet.config.metrics.map((m) => `${m.aggregation}:${m.field}`),
        filters: sheet.config.filters.map((f) => `${f.field}:${f.operator}:${JSON.stringify(f.value)}`),
      });
      if (seenSignatures.has(signature)) return false;
      seenSignatures.add(signature);
      return sheet.config.metrics.length > 0 || sheet.config.dimensions.length > 0;
    });

  if (sheets.length > 0) return sheets;

  return [{
    title: String(raw.title ?? "AI Chart"),
    description: String(raw.description ?? ""),
    insight: String(raw.insight ?? ""),
    config: sanitiseConfig(raw, fields, options),
  }];
}
