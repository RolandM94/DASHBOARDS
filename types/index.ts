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

export type AggregationFn = "SUM" | "COUNT" | "AVG" | "MIN" | "MAX" | "CALCULATED";

export interface Metric {
  id: string;
  field: string;
  aggregation: AggregationFn;
  label: string;
  /** Formula for CALCULATED metrics. References existing metric labels as {Label}. */
  formula?: string;
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

export interface WorkbookSheet extends WorksheetConfig {
  id: string;
  name: string;
  description?: string;
}

export interface WorkbookConfig {
  version: 1;
  activeSheetId: string;
  sheets: WorkbookSheet[];
}

export type WorkbookOrWorksheetConfig = WorksheetConfig | WorkbookConfig;

// ─── Saved Worksheet ─────────────────────────────────────────────

export type WorksheetStatus = "draft" | "saved" | "archived";

export interface Worksheet {
  id: string;
  name: string;
  description?: string;
  datasetId: string;
  config: WorkbookOrWorksheetConfig;
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
  sheetId?: string;
  title?: string;
}

export interface TextBlockConfig extends BaseBlock {
  type: "text";
  content: string;
  /** When set, this text block is an AI insight linked to a worksheet and can be refreshed. */
  worksheetId?: string;
  /** Optional sheet inside the linked workbook. */
  sheetId?: string;
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
  accessRole?: "owner" | "editor" | "viewer";
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

/** Active smart analytical filters — list of smart filter IDs. */
export type ActiveSmartFilters = string[];

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
  /** One or more chart sheets generated for a workbook. Single-chart responses return one sheet. */
  sheets?: Array<{
    title: string;
    description: string;
    insight: string;
    config: WorksheetConfig;
  }>;
  dataCoverage?: Array<{
    sheetTitle: string;
    field: string;
    distinctCount: number;
  }>;
  /** ID of the ai_logs row created for this request. */
  logId?:      string;
}

// ─── AI Report Generation Engine ─────────────────────────────────

export type ReportSourceType = "dashboard" | "canvas";
export type ReportType = "executive_summary" | "management_report" | "technical_report" | "custom_report";

export type ReportProjectStatus =
  | "draft"
  | "blueprint_generated"
  | "blueprint_approved"
  | "generating"
  | "generated"
  | "exported"
  | "review"
  | "approved"
  | "archived"
  | "failed";

export interface ReportProject {
  id: string;
  name: string;
  description?: string;
  sourceType: ReportSourceType;
  sourceDashboardId?: string;
  sourceCanvasId?: string;
  templateId?: string;
  reportType: ReportType;
  status: ReportProjectStatus;
  workflowEnabled: boolean;
  reviewRequestedBy?: string;
  reviewRequestedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  lockedBy?: string;
  lockedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSourceSnapshot {
  id: string;
  reportProjectId: string;
  sourceType: ReportSourceType;
  sourceId: string;
  activeFiltersSnapshot: unknown;
  widgetsSnapshot: unknown;
  worksheetsSnapshot: unknown;
  insightsSnapshot: unknown;
  queryOutputsSnapshot: unknown;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ReportBlueprintStatus = "draft" | "edited" | "approved" | "locked" | "superseded";

export interface ReportBlueprint {
  id: string;
  reportProjectId: string;
  version: number;
  status: ReportBlueprintStatus;
  title: string;
  objective?: string;
  audience?: string;
  blueprintJson: Record<string, unknown>;
  generatedByAi: boolean;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportSectionType =
  | "executive_summary"
  | "introduction"
  | "methodology"
  | "chart_analysis"
  | "table_analysis"
  | "kpi_summary"
  | "risk_analysis"
  | "recommendation"
  | "appendix"
  | "custom";

export type ReportSectionStatus = "pending" | "generating" | "generated" | "edited" | "approved" | "failed";

export interface ReportSection {
  id: string;
  reportProjectId: string;
  reportBlueprintId?: string;
  parentSectionId?: string;
  sectionKey: string;
  title: string;
  sectionType: ReportSectionType;
  orderIndex: number;
  sourceWidgetIds: string[];
  sourceWorksheetIds: string[];
  sourceInsightIds: string[];
  sectionPrompt?: string;
  sectionConfig: Record<string, unknown>;
  status: ReportSectionStatus;
  generatedContent?: string;
  editedContent?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ReportExportFormat = "docx" | "pdf" | "excel" | "html";
export type ReportExportStatus = "pending" | "exporting" | "exported" | "failed";

export interface ReportExport {
  id: string;
  reportProjectId: string;
  reportBlueprintId?: string;
  format: ReportExportFormat;
  fileUrl?: string;
  filePath?: string;
  exportConfig: Record<string, unknown>;
  status: ReportExportStatus;
  exportedBy?: string;
  exportedAt?: string;
  createdAt: string;
}

export type ReportCompilationStatus = "compiled" | "superseded";

export interface ReportCompilation {
  id: string;
  reportProjectId: string;
  reportBlueprintId?: string;
  sourceSnapshotId?: string;
  title: string;
  compiledPayload: Record<string, unknown>;
  status: ReportCompilationStatus;
  compiledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ReportJobType =
  | "capture_source_snapshot"
  | "generate_blueprint"
  | "generate_section"
  | "generate_all_sections"
  | "compile_report"
  | "export_report";

export interface ReportJob {
  id: string;
  reportProjectId: string;
  jobType: ReportJobType;
  status: ReportJobStatus;
  progressPercent: number;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  errorMessage?: string;
  jobPayload: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface TemplateLayoutSlot {
  type: "ai_narrative" | "chart" | "table" | "image" | "divider" | "text_block";
  width: number;
  prompt?: string;
  widget_selector?: {
    match_type: "by_id" | "by_type" | "by_worksheet" | "any";
    value?: string;
  };
  default_content?: string;
}

export interface TemplateLayoutSection {
  section_key: string;
  title: string;
  section_type: string;
  layout: {
    rows: Array<{
      columns: TemplateLayoutSlot[];
    }>;
  };
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  layoutJson: {
    sections: TemplateLayoutSection[];
    settings?: {
      sampleForm?: "single_column" | "two_columns";
      contentDensity?: "concise" | "standard" | "detailed";
      orientation?: "portrait" | "landscape";
      includeTables?: boolean;
      includeInfographics?: boolean;
      includeFootnotes?: boolean;
      includePageNumbers?: boolean;
      analysisFocus?: string;
    };
    referencePrompt?: string;
  };
  referenceDocumentIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ReferenceDocumentFileType = "pdf" | "docx" | "txt" | "md";

export interface ReferenceDocument {
  id: string;
  templateId?: string;
  reportProjectId?: string;
  filename: string;
  fileUrl: string;
  fileType: ReferenceDocumentFileType;
  extractedText?: string;
  pageCount: number;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

export type ReportGenerationLogStatus = "pending" | "success" | "failed";

export interface ReportGenerationLog {
  id: string;
  reportProjectId?: string;
  userId: string;
  actionType: string;
  inputPayload: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  aiModel?: string;
  status: ReportGenerationLogStatus;
  errorMessage?: string;
  createdAt: string;
}
