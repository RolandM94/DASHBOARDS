import { ActiveGlobalFilters, CanvasBlock, Dataset, DateRangeValue, Filter, FilterOperator, GlobalFilterValue, NumericRangeValue, Worksheet, WidgetBlockConfig, isDateType, isNumericType } from "@/types";

/**
 * Returns true if a GlobalFilterValue has any active selection.
 */
export function hasActiveFilterValue(v: GlobalFilterValue | undefined): boolean {
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isNumericRange(v)) return v.min !== undefined || v.max !== undefined;
  if (isDateRange(v)) return v.from !== undefined || v.to !== undefined;
  return v !== "";
}

/**
 * Serialises activeFilters to a compact JSON string for the ?filters= URL param.
 * Only includes fields that have an active value.
 */
export function encodeFiltersParam(filters: ActiveGlobalFilters): string {
  const active = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => hasActiveFilterValue(v))
  );
  if (Object.keys(active).length === 0) return "";
  return JSON.stringify(active);
}

/**
 * Parses a ?filters= URL param value back into ActiveGlobalFilters.
 * Returns {} on any parse error.
 */
export function decodeFiltersParam(param: string | null): ActiveGlobalFilters {
  if (!param) return {};
  try {
    const parsed = JSON.parse(param);
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) return {};
    return parsed as ActiveGlobalFilters;
  } catch {
    return {};
  }
}

/**
 * Returns true if the value is a NumericRangeValue (min/max range object).
 * Use this before passing globalFilters to the aggregate API — range values
 * must be converted to gte/lte worksheet filters instead.
 */
export function isNumericRange(v: GlobalFilterValue | undefined): v is NumericRangeValue {
  if (typeof v !== "object" || Array.isArray(v) || v === null) return false;
  return "min" in v || "max" in v;
}

/**
 * Returns true if the value is a DateRangeValue (from/to ISO date strings).
 */
export function isDateRange(v: GlobalFilterValue | undefined): v is DateRangeValue {
  if (typeof v !== "object" || Array.isArray(v) || v === null) return false;
  return "from" in v || "to" in v;
}

/**
 * Splits activeFilters into:
 * - cleanGlobalFilters: only string/array values (safe to pass as p_global_filters to DB)
 * - extraFilters: range values converted to gte/lte Filter objects for p_worksheet_filters
 */
export function splitFiltersForApi(activeFilters: ActiveGlobalFilters): {
  cleanGlobalFilters: Record<string, string | string[]>;
  extraFilters: Filter[];
} {
  const cleanGlobalFilters: Record<string, string | string[]> = {};
  const extraFilters: Filter[] = [];

  for (const [field, value] of Object.entries(activeFilters)) {
    if (isNumericRange(value)) {
      if (value.min !== undefined) {
        extraFilters.push({ id: `gf-${field}-min`, field, operator: "gte", value: value.min, label: field });
      }
      if (value.max !== undefined) {
        extraFilters.push({ id: `gf-${field}-max`, field, operator: "lte", value: value.max, label: field });
      }
    } else if (isDateRange(value)) {
      if (value.from) {
        extraFilters.push({ id: `gf-${field}-from`, field, operator: "gte", value: value.from, label: field });
      }
      if (value.to) {
        extraFilters.push({ id: `gf-${field}-to`, field, operator: "lte", value: value.to, label: field });
      }
    } else {
      cleanGlobalFilters[field] = value as string | string[];
    }
  }

  return { cleanGlobalFilters, extraFilters };
}

function matchesFilter(value: unknown, operator: FilterOperator, filterValue: Filter["value"]): boolean {
  const strVal = String(value ?? "").toLowerCase();
  const numVal = typeof value === "number" ? value : parseFloat(String(value));

  switch (operator) {
    case "equals":
      return strVal === String(filterValue).toLowerCase();
    case "not_equals":
      return strVal !== String(filterValue).toLowerCase();
    case "contains":
      return strVal.includes(String(filterValue).toLowerCase());
    case "in":
      if (Array.isArray(filterValue)) {
        return filterValue.map((v) => String(v).toLowerCase()).includes(strVal);
      }
      return strVal === String(filterValue).toLowerCase();
    case "gt":
      if (!isNaN(numVal)) return numVal > Number(filterValue);
      return strVal > String(filterValue).toLowerCase();
    case "gte":
      if (!isNaN(numVal)) return numVal >= Number(filterValue);
      return strVal >= String(filterValue).toLowerCase();
    case "lt":
      if (!isNaN(numVal)) return numVal < Number(filterValue);
      return strVal < String(filterValue).toLowerCase();
    case "lte":
      if (!isNaN(numVal)) return numVal <= Number(filterValue);
      return strVal <= String(filterValue).toLowerCase();
    default:
      return true;
  }
}

export function applyFilters(
  rows: Record<string, unknown>[],
  filters: Filter[]
): Record<string, unknown>[] {
  if (!filters.length) return rows;

  return rows.filter((row) =>
    filters.every((f) => {
      if (!f.field || f.value === "" || (Array.isArray(f.value) && f.value.length === 0)) return true;
      return matchesFilter(row[f.field], f.operator, f.value);
    })
  );
}

export function buildCanvasFilterObjects(
  activeFilters: ActiveGlobalFilters,
  worksheetFields: string[]
): Filter[] {
  return Object.entries(activeFilters)
    .filter(([field]) => worksheetFields.includes(field))
    .filter(([, value]) => {
      // Only build simple equality filters for string/array values;
      // numeric/date ranges are handled via splitFiltersForApi.
      if (typeof value !== "string" && !Array.isArray(value)) return false;
      if (Array.isArray(value)) return value.length > 0;
      return value !== "";
    })
    .map(([field, value]) => ({
      id: `canvas-${field}`,
      field,
      operator: (Array.isArray(value) ? "in" : "equals") as FilterOperator,
      value: value as string | string[],
      label: field,
    }));
}

export function getCanvasFields(
  blocks: CanvasBlock[],
  getWorksheet: (id: string) => Worksheet | undefined,
  getDataset: (id: string) => Dataset | undefined
): import("@/types").DatasetField[] {
  const seen = new Set<string>();
  const fields: import("@/types").DatasetField[] = [];
  for (const block of blocks) {
    if (block.type !== "widget") continue;
    const ws = getWorksheet((block as WidgetBlockConfig).worksheetId);
    if (!ws) continue;
    const ds = getDataset(ws.datasetId);
    if (!ds) continue;
    for (const f of ds.fields) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        fields.push(f);
      }
    }
  }
  return fields;
}

/**
 * Returns a map of { fieldName → count of widget blocks whose dataset
 * contains that field }. Used to power "applies to N widgets" badges in the
 * filter drawer and filter bar.
 */
export function getFieldWidgetCounts(
  blocks: CanvasBlock[],
  getWorksheet: (id: string) => Worksheet | undefined,
  getDataset: (id: string) => Dataset | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    if (block.type !== "widget") continue;
    const ws = getWorksheet((block as WidgetBlockConfig).worksheetId);
    if (!ws) continue;
    const ds = getDataset(ws.datasetId);
    if (!ds) continue;
    const seenInBlock = new Set<string>();
    for (const f of ds.fields) {
      if (!seenInBlock.has(f.name)) {
        seenInBlock.add(f.name);
        counts[f.name] = (counts[f.name] ?? 0) + 1;
      }
    }
  }
  return counts;
}

// ── Filter category grouping ──────────────────────────────────────

export type FilterCategory =
  | "time"
  | "organisation"
  | "geographic"
  | "project"
  | "financial"
  | "other";

export const FILTER_CATEGORY_ORDER: FilterCategory[] = [
  "time",
  "organisation",
  "geographic",
  "project",
  "financial",
  "other",
];

export const FILTER_CATEGORY_LABELS: Record<FilterCategory, string> = {
  time: "Time",
  organisation: "Organisation",
  geographic: "Geographic",
  project: "Project",
  financial: "Financial",
  other: "Other",
};

export function detectFilterCategory(
  field: import("@/types").DatasetField
): FilterCategory {
  const name = field.name.toLowerCase();

  if (
    isDateType(field.type) ||
    /\b(year|quarter|month|date|period|fy|fiscal|q[1-4])\b/.test(name)
  )
    return "time";

  if (
    /\b(ministry|department|dept|agency|sector|mda|org|unit|division|bureau)\b/.test(
      name
    )
  )
    return "organisation";

  if (
    /\b(state|region|zone|lga|local|geo|location|city|country|province)\b/.test(
      name
    )
  )
    return "geographic";

  if (
    /\b(project|status|programme|program|source|category|type|phase|stage)\b/.test(
      name
    )
  )
    return "project";

  if (
    isNumericType(field.type) ||
    /\b(budget|expenditure|spend|amount|cost|fund|allocation|release|variance|utilization|utilisation|revenue|capital|overhead)\b/.test(
      name
    )
  )
    return "financial";

  return "other";
}

export function groupFieldsByCategory(
  fields: import("@/types").DatasetField[]
): Array<{
  category: FilterCategory;
  label: string;
  fields: import("@/types").DatasetField[];
}> {
  const map = new Map<FilterCategory, import("@/types").DatasetField[]>();
  for (const cat of FILTER_CATEGORY_ORDER) map.set(cat, []);
  for (const f of fields) {
    const cat = detectFilterCategory(f);
    map.get(cat)!.push(f);
  }
  return FILTER_CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: FILTER_CATEGORY_LABELS[cat],
    fields: map.get(cat)!,
  })).filter((g) => g.fields.length > 0);
}
