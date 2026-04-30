// ─── Raw data from parser ──────────────────────────────────────────

/**
 * Granular field types.
 * - "integer"  — Number (Whole): whole numbers only, AVG rounds to integer
 * - "decimal"  — Number (Decimal): floating-point numbers
 * - "number"   — legacy alias emitted by old parser, treated as "decimal" everywhere
 * - "date"     — Date only (no time component)
 * - "datetime" — Date and Time (ISO 8601 with time)
 * - "string"   — Text
 * - "boolean"  — true/false (auto-detected only, not user-selectable)
 */
export type FieldType =
  | "string"
  | "integer"
  | "decimal"
  | "number"    // legacy — treat as "decimal"
  | "date"
  | "datetime"
  | "boolean";

/** True for any numeric field type (integer, decimal, or legacy number). */
export function isNumericType(t: FieldType): boolean {
  return t === "integer" || t === "decimal" || t === "number";
}

/** True for any date/time field type. */
export function isDateType(t: FieldType): boolean {
  return t === "date" || t === "datetime";
}

/**
 * Canonical display label for a FieldType in the UI.
 * "default" is a virtual selection meaning "reset to inferredType".
 */
export const FIELD_TYPE_LABELS: Record<FieldType | "default", string> = {
  integer:  "Number (Whole)",
  decimal:  "Number (Decimal)",
  number:   "Number (Decimal)",   // legacy alias
  string:   "String",
  date:     "Date",
  datetime: "Date and Time",
  boolean:  "Boolean",
  default:  "Default",
};

export interface DatasetField {
  name: string;
  type: FieldType;
  /** The type inferred at upload time — used to reset to "Default". */
  inferredType?: FieldType;
  sample: string[];
  /** Optional human-readable description shown in UI and fed to AI for better field selection. */
  description?: string;
}

export interface Dataset {
  id: string;
  fileName: string;
  uploadedAt: string;
  fields: DatasetField[];
  rowCount?: number;
  /** Rows are not stored in memory — aggregation happens server-side. */
  rows?: Record<string, unknown>[];
  /** Visibility level — present when loaded from /api/datasets. */
  visibility?: DatasetVisibility;
  /** True for pre-loaded system datasets available to all users. */
  isSeed?: boolean;
  /** How this user gained access to the dataset. */
  accessType?: "own" | "seed" | "org" | "share" | "public";
}

// ─── Worksheet config ─────────────────────────────────────────────

export type AggregationFn = "SUM" | "COUNT" | "AVG" | "MIN" | "MAX";

export interface Metric {
  id: string;
  field: string;
  aggregation: AggregationFn;
  label: string;
  /** Carried through to aggregate_dataset so integer AVG can be rounded. */
  fieldType?: FieldType;
}

export interface Dimension {
  id: string;
  field: string;
  label: string;
}

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export interface Filter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string | string[] | number;
  label: string;
}

export type ChartType =
  | "bar"
  | "grouped_bar"
  | "line"
  | "pie"
  | "area"
  | "kpi"
  | "table"
  | "map";

export type SortOrder =
  | "natural"
  | "value_asc"
  | "value_desc"
  | "top_5"
  | "top_10"
  | "top_20"
  | "alpha_asc"
  | "alpha_desc";

export interface WorksheetConfig {
  metrics: Metric[];
  dimensions: Dimension[];
  filters: Filter[];
  chartType: ChartType;
  logScale?: boolean;
  sort?: SortOrder;
}

// ─── Saved Worksheet ─────────────────────────────────────────────

export type WorksheetStatus = "draft" | "saved";

export interface Worksheet {
  id: string;
  name: string;
  description?: string;
  datasetId: string;
  config: WorksheetConfig;
  createdAt: string;
  updatedAt: string;
  status: WorksheetStatus;
}

// ─── Canvas ───────────────────────────────────────────────────────

export type BlockType = "widget" | "text" | "filter" | "preview";

export interface BaseBlock {
  id: string;
  type: BlockType;
  order: number;
}

export interface WidgetBlockConfig extends BaseBlock {
  type: "widget";
  worksheetId: string;
  title?: string;
}

export interface TextBlockConfig extends BaseBlock {
  type: "text";
  content: string;
  /** When set, this text block is an AI insight linked to a worksheet and can be refreshed. */
  worksheetId?: string;
}

export interface DatasetPreviewBlockConfig extends BaseBlock {
  type: "preview";
  datasetId: string;
  /** Max rows to show in the preview table (default 10). */
  rowLimit?: number;
}

export interface FilterBlockConfig extends BaseBlock {
  type: "filter";
  field: string;
  filterType: "dropdown" | "multi_select";
  label: string;
}

export type CanvasBlock = WidgetBlockConfig | TextBlockConfig | FilterBlockConfig | DatasetPreviewBlockConfig;

// Grid position for each block in the 2-D canvas layout
export interface GridLayoutItem {
  i: string;      // block id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface Canvas {
  id: string;
  name: string;
  blocks: CanvasBlock[];
  layout?: GridLayoutItem[];   // 2-D grid positions — absent on old canvases, generated on load
  createdAt: string;
  updatedAt: string;
  published: boolean;
  publishedTitle?: string;
  publishedPermission?: DashboardPermission;
  publishedAt?: string;
}

// ─── Dashboard (published snapshot of Canvas) ────────────────────

export type DashboardPermission = "private" | "org" | "public";

export interface PublishedDashboard {
  id: string;
  canvasId: string;
  title: string;
  permission: DashboardPermission;
  publishedAt: string;
  blocks: CanvasBlock[];
  layout?: GridLayoutItem[];
}

// ─── Global filter runtime values ────────────────────────────────

/** Represents a numeric min/max range filter applied from the canvas filter bar. */
export interface NumericRangeValue {
  min?: number;
  max?: number;
}

/** Represents a date from/to range filter (ISO "YYYY-MM-DD" strings). */
export interface DateRangeValue {
  from?: string;
  to?: string;
}

export type GlobalFilterValue = string | string[] | NumericRangeValue | DateRangeValue;
export type ActiveGlobalFilters = Record<string, GlobalFilterValue>;

// ─── Chart rendering ─────────────────────────────────────────────

export interface ChartDataPoint {
  [key: string]: string | number;
}

export interface ResolvedChartData {
  data: ChartDataPoint[];
  xKey: string;
  yKeys: string[];
}

// ─── Multi-user sharing ───────────────────────────────────────────

export type DatasetVisibility = "private" | "org" | "public";
export type DatasetSharePermission = "viewer" | "editor";

export type OrgRole = "owner" | "admin" | "member" | "editor" | "viewer";
export type OrgMemberStatus = "active" | "pending";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId?: string;
  email: string;
  role: OrgRole;
  status: OrgMemberStatus;
  invitedBy?: string;
  invitedAt: string;
  /** Joined from profiles — available when status = 'active'. */
  displayName?: string;
  avatarUrl?: string;
}

export interface DatasetShare {
  id: string;
  datasetId: string;
  sharedWithEmail: string;
  sharedWithUserId?: string;
  permission: DatasetSharePermission;
  createdAt: string;
  /** Joined from profiles when the user has signed up. */
  displayName?: string;
}

// ─── AI Assistant ─────────────────────────────────────────────────

/** One row in the ai_logs table — records every generation attempt. */
export interface AILog {
  id:          string;
  userId:      string;
  datasetId?:  string;
  canvasId?:   string;
  worksheetId?: string;
  prompt:      string;
  config?:     WorksheetConfig;
  error?:      string;
  createdAt:   string;
}

/** Shape returned by POST /api/ai/generate */
export interface AIGenerateResponse {
  title:       string;
  description: string;
  /** 2–3 sentence analytical insight about what the chart reveals. */
  insight:     string;
  config:      WorksheetConfig;
  /** ID of the ai_logs row created for this request. */
  logId?:      string;
}

