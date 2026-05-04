import type {
  ReportBlueprint,
  ReportBlueprintStatus,
  ReportCompilation,
  ReportCompilationStatus,
  ReportExport,
  ReportExportFormat,
  ReportExportStatus,
  ReportJob,
  ReportJobStatus,
  ReportJobType,
  ReportProject,
  ReportProjectStatus,
  ReportSection,
  ReportSectionStatus,
  ReportSectionType,
  ReportSourceSnapshot,
  ReportSourceType,
  ReportType,
} from "@/types";

export const REPORT_SOURCE_TYPES = ["dashboard", "canvas"] as const;
export const REPORT_TYPES = ["executive_summary", "management_report", "technical_report", "custom_report"] as const;
export const REPORT_PROJECT_STATUSES = [
  "draft",
  "blueprint_generated",
  "blueprint_approved",
  "generating",
  "generated",
  "exported",
  "review",
  "approved",
  "archived",
  "failed",
] as const;
export const REPORT_BLUEPRINT_STATUSES = ["draft", "edited", "approved", "locked", "superseded"] as const;
export const REPORT_SECTION_TYPES = [
  "executive_summary",
  "introduction",
  "methodology",
  "chart_analysis",
  "table_analysis",
  "kpi_summary",
  "risk_analysis",
  "recommendation",
  "appendix",
  "custom",
] as const;
export const REPORT_SECTION_STATUSES = ["pending", "generating", "generated", "edited", "approved", "failed"] as const;
export const REPORT_EXPORT_FORMATS = ["docx", "pdf", "excel", "html"] as const;
export const REPORT_EXPORT_STATUSES = ["pending", "exporting", "exported", "failed"] as const;
export const REPORT_JOB_TYPES = ["capture_source_snapshot", "generate_blueprint", "generate_section", "generate_all_sections", "compile_report", "export_report"] as const;
export const REPORT_JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

type JsonObject = Record<string, unknown>;
type Row = Record<string, unknown>;

export function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function optionalJsonObject(value: unknown): JsonObject | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

export function dbToReportProject(row: Row): ReportProject {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    sourceType: row.source_type as ReportSourceType,
    sourceDashboardId: row.source_dashboard_id ? String(row.source_dashboard_id) : undefined,
    sourceCanvasId: row.source_canvas_id ? String(row.source_canvas_id) : undefined,
    templateId: row.template_id ? String(row.template_id) : undefined,
    reportType: row.report_type as ReportType,
    status: row.status as ReportProjectStatus,
    workflowEnabled: Boolean(row.workflow_enabled),
    reviewRequestedBy: row.review_requested_by ? String(row.review_requested_by) : undefined,
    reviewRequestedAt: row.review_requested_at ? String(row.review_requested_at) : undefined,
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    lockedBy: row.locked_by ? String(row.locked_by) : undefined,
    lockedAt: row.locked_at ? String(row.locked_at) : undefined,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function dbToReportSourceSnapshot(row: Row): ReportSourceSnapshot {
  return {
    id: String(row.id),
    reportProjectId: String(row.report_project_id),
    sourceType: row.source_type as ReportSourceType,
    sourceId: String(row.source_id),
    activeFiltersSnapshot: row.active_filters_snapshot ?? {},
    widgetsSnapshot: row.widgets_snapshot ?? [],
    worksheetsSnapshot: row.worksheets_snapshot ?? [],
    insightsSnapshot: row.insights_snapshot ?? [],
    queryOutputsSnapshot: row.query_outputs_snapshot ?? {},
    metadata: (row.metadata ?? {}) as JsonObject,
    createdAt: String(row.created_at),
  };
}

export function dbToReportBlueprint(row: Row): ReportBlueprint {
  return {
    id: String(row.id),
    reportProjectId: String(row.report_project_id),
    version: Number(row.version),
    status: row.status as ReportBlueprintStatus,
    title: String(row.title),
    objective: row.objective ? String(row.objective) : undefined,
    audience: row.audience ? String(row.audience) : undefined,
    blueprintJson: (row.blueprint_json ?? {}) as JsonObject,
    generatedByAi: Boolean(row.generated_by_ai),
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function dbToReportSection(row: Row): ReportSection {
  return {
    id: String(row.id),
    reportProjectId: String(row.report_project_id),
    reportBlueprintId: row.report_blueprint_id ? String(row.report_blueprint_id) : undefined,
    parentSectionId: row.parent_section_id ? String(row.parent_section_id) : undefined,
    sectionKey: String(row.section_key),
    title: String(row.title),
    sectionType: row.section_type as ReportSectionType,
    orderIndex: Number(row.order_index),
    sourceWidgetIds: Array.isArray(row.source_widget_ids) ? row.source_widget_ids as string[] : [],
    sourceWorksheetIds: Array.isArray(row.source_worksheet_ids) ? row.source_worksheet_ids as string[] : [],
    sourceInsightIds: Array.isArray(row.source_insight_ids) ? row.source_insight_ids as string[] : [],
    sectionPrompt: row.section_prompt ? String(row.section_prompt) : undefined,
    sectionConfig: (row.section_config ?? {}) as JsonObject,
    status: row.status as ReportSectionStatus,
    generatedContent: row.generated_content ? String(row.generated_content) : undefined,
    editedContent: row.edited_content ? String(row.edited_content) : undefined,
    metadata: (row.metadata ?? {}) as JsonObject,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function dbToReportExport(row: Row): ReportExport {
  return {
    id: String(row.id),
    reportProjectId: String(row.report_project_id),
    reportBlueprintId: row.report_blueprint_id ? String(row.report_blueprint_id) : undefined,
    format: row.format as ReportExportFormat,
    fileUrl: row.file_url ? String(row.file_url) : undefined,
    filePath: row.file_path ? String(row.file_path) : undefined,
    exportConfig: (row.export_config ?? {}) as JsonObject,
    status: row.status as ReportExportStatus,
    exportedBy: row.exported_by ? String(row.exported_by) : undefined,
    exportedAt: row.exported_at ? String(row.exported_at) : undefined,
    createdAt: String(row.created_at),
  };
}

export function dbToReportCompilation(row: Row): ReportCompilation {
  return {
    id: String(row.id),
    reportProjectId: String(row.report_project_id),
    reportBlueprintId: row.report_blueprint_id ? String(row.report_blueprint_id) : undefined,
    sourceSnapshotId: row.source_snapshot_id ? String(row.source_snapshot_id) : undefined,
    title: String(row.title),
    compiledPayload: (row.compiled_payload ?? {}) as JsonObject,
    status: row.status as ReportCompilationStatus,
    compiledBy: row.compiled_by ? String(row.compiled_by) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function buildReportProjectInsert(body: JsonObject, userId: string): { data?: JsonObject; error?: string } {
  const name = optionalString(body.name);
  if (!name) return { error: "Report project name is required" };

  if (!isOneOf(body.sourceType, REPORT_SOURCE_TYPES)) {
    return { error: "sourceType must be dashboard or canvas" };
  }

  const reportType = isOneOf(body.reportType, REPORT_TYPES) ? body.reportType : "custom_report";
  const sourceDashboardId = optionalString(body.sourceDashboardId);
  const sourceCanvasId = optionalString(body.sourceCanvasId);
  const templateId = optionalString(body.templateId);

  if (body.sourceType === "dashboard" && !sourceDashboardId) {
    return { error: "sourceDashboardId is required for dashboard reports" };
  }
  if (body.sourceType === "canvas" && !sourceCanvasId) {
    return { error: "sourceCanvasId is required for canvas reports" };
  }

  return {
    data: {
      name,
      description: optionalString(body.description) ?? null,
      source_type: body.sourceType,
      source_dashboard_id: body.sourceType === "dashboard" ? sourceDashboardId : null,
      source_canvas_id: body.sourceType === "canvas" ? sourceCanvasId : null,
      template_id: templateId ?? null,
      report_type: reportType,
      status: "draft",
      created_by: userId,
    },
  };
}

export function buildReportProjectPatch(body: JsonObject): { data?: JsonObject; error?: string } {
  const patch: JsonObject = {};
  if (body.name !== undefined) {
    const name = optionalString(body.name);
    if (!name) return { error: "Report project name cannot be empty" };
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = optionalString(body.description) ?? null;
  if (body.reportType !== undefined) {
    if (!isOneOf(body.reportType, REPORT_TYPES)) return { error: "Invalid reportType" };
    patch.report_type = body.reportType;
  }
  if (body.status !== undefined) {
    if (!isOneOf(body.status, REPORT_PROJECT_STATUSES)) return { error: "Invalid status" };
    patch.status = body.status;
  }
  if (body.workflowEnabled !== undefined) patch.workflow_enabled = Boolean(body.workflowEnabled);
  return Object.keys(patch).length === 0 ? { error: "No fields to update" } : { data: patch };
}

export function buildReportBlueprintInsert(body: JsonObject, reportProjectId: string, version: number): { data?: JsonObject; error?: string } {
  const title = optionalString(body.title);
  if (!title) return { error: "Blueprint title is required" };

  const status = isOneOf(body.status, REPORT_BLUEPRINT_STATUSES) ? body.status : "draft";
  return {
    data: {
      report_project_id: reportProjectId,
      version,
      status,
      title,
      objective: optionalString(body.objective) ?? null,
      audience: optionalString(body.audience) ?? null,
      blueprint_json: optionalJsonObject(body.blueprintJson) ?? {},
      generated_by_ai: Boolean(body.generatedByAi),
      approved_by: optionalString(body.approvedBy) ?? null,
      approved_at: optionalString(body.approvedAt) ?? null,
    },
  };
}

export function buildReportBlueprintPatch(body: JsonObject): { data?: JsonObject; error?: string } {
  const patch: JsonObject = {};
  if (body.status !== undefined) {
    if (!isOneOf(body.status, REPORT_BLUEPRINT_STATUSES)) return { error: "Invalid status" };
    patch.status = body.status;
  }
  if (body.title !== undefined) {
    const title = optionalString(body.title);
    if (!title) return { error: "Blueprint title cannot be empty" };
    patch.title = title;
  }
  if (body.objective !== undefined) patch.objective = optionalString(body.objective) ?? null;
  if (body.audience !== undefined) patch.audience = optionalString(body.audience) ?? null;
  if (body.blueprintJson !== undefined) {
    const blueprintJson = optionalJsonObject(body.blueprintJson);
    if (!blueprintJson) return { error: "blueprintJson must be an object" };
    patch.blueprint_json = blueprintJson;
  }
  if (body.generatedByAi !== undefined) patch.generated_by_ai = Boolean(body.generatedByAi);
  if (body.approvedBy !== undefined) patch.approved_by = optionalString(body.approvedBy) ?? null;
  if (body.approvedAt !== undefined) patch.approved_at = optionalString(body.approvedAt) ?? null;
  return Object.keys(patch).length === 0 ? { error: "No fields to update" } : { data: patch };
}

export function buildReportSectionInsert(body: JsonObject, reportProjectId: string): { data?: JsonObject; error?: string } {
  const sectionKey = optionalString(body.sectionKey);
  const title = optionalString(body.title);
  if (!sectionKey) return { error: "sectionKey is required" };
  if (!title) return { error: "Section title is required" };

  const sectionType = isOneOf(body.sectionType, REPORT_SECTION_TYPES) ? body.sectionType : "custom";
  const status = isOneOf(body.status, REPORT_SECTION_STATUSES) ? body.status : "pending";
  return {
    data: {
      report_project_id: reportProjectId,
      report_blueprint_id: optionalString(body.reportBlueprintId) ?? null,
      parent_section_id: optionalString(body.parentSectionId) ?? null,
      section_key: sectionKey,
      title,
      section_type: sectionType,
      order_index: typeof body.orderIndex === "number" ? body.orderIndex : 0,
      source_widget_ids: optionalStringArray(body.sourceWidgetIds) ?? [],
      source_worksheet_ids: optionalStringArray(body.sourceWorksheetIds) ?? [],
      source_insight_ids: optionalStringArray(body.sourceInsightIds) ?? [],
      section_prompt: optionalString(body.sectionPrompt) ?? null,
      section_config: optionalJsonObject(body.sectionConfig) ?? {},
      status,
      generated_content: optionalString(body.generatedContent) ?? null,
      edited_content: optionalString(body.editedContent) ?? null,
      metadata: optionalJsonObject(body.metadata) ?? {},
    },
  };
}

export function buildReportSectionPatch(body: JsonObject): { data?: JsonObject; error?: string } {
  const patch: JsonObject = {};
  if (body.reportBlueprintId !== undefined) patch.report_blueprint_id = optionalString(body.reportBlueprintId) ?? null;
  if (body.parentSectionId !== undefined) patch.parent_section_id = optionalString(body.parentSectionId) ?? null;
  if (body.sectionKey !== undefined) {
    const sectionKey = optionalString(body.sectionKey);
    if (!sectionKey) return { error: "sectionKey cannot be empty" };
    patch.section_key = sectionKey;
  }
  if (body.title !== undefined) {
    const title = optionalString(body.title);
    if (!title) return { error: "Section title cannot be empty" };
    patch.title = title;
  }
  if (body.sectionType !== undefined) {
    if (!isOneOf(body.sectionType, REPORT_SECTION_TYPES)) return { error: "Invalid sectionType" };
    patch.section_type = body.sectionType;
  }
  if (body.orderIndex !== undefined) patch.order_index = typeof body.orderIndex === "number" ? body.orderIndex : 0;
  if (body.sourceWidgetIds !== undefined) patch.source_widget_ids = optionalStringArray(body.sourceWidgetIds) ?? [];
  if (body.sourceWorksheetIds !== undefined) patch.source_worksheet_ids = optionalStringArray(body.sourceWorksheetIds) ?? [];
  if (body.sourceInsightIds !== undefined) patch.source_insight_ids = optionalStringArray(body.sourceInsightIds) ?? [];
  if (body.sectionPrompt !== undefined) patch.section_prompt = optionalString(body.sectionPrompt) ?? null;
  if (body.sectionConfig !== undefined) {
    const sectionConfig = optionalJsonObject(body.sectionConfig);
    if (!sectionConfig) return { error: "sectionConfig must be an object" };
    patch.section_config = sectionConfig;
  }
  if (body.status !== undefined) {
    if (!isOneOf(body.status, REPORT_SECTION_STATUSES)) return { error: "Invalid status" };
    patch.status = body.status;
  }
  if (body.generatedContent !== undefined) patch.generated_content = optionalString(body.generatedContent) ?? null;
  if (body.editedContent !== undefined) patch.edited_content = optionalString(body.editedContent) ?? null;
  if (body.metadata !== undefined) {
    const metadata = optionalJsonObject(body.metadata);
    if (!metadata) return { error: "metadata must be an object" };
    patch.metadata = metadata;
  }
  return Object.keys(patch).length === 0 ? { error: "No fields to update" } : { data: patch };
}

export function buildReportExportInsert(body: JsonObject, reportProjectId: string, userId: string): { data?: JsonObject; error?: string } {
  if (!isOneOf(body.format, REPORT_EXPORT_FORMATS)) return { error: "Invalid export format" };
  const status = isOneOf(body.status, REPORT_EXPORT_STATUSES) ? body.status : "pending";
  return {
    data: {
      report_project_id: reportProjectId,
      report_blueprint_id: optionalString(body.reportBlueprintId) ?? null,
      format: body.format,
      file_url: optionalString(body.fileUrl) ?? null,
      file_path: optionalString(body.filePath) ?? null,
      export_config: optionalJsonObject(body.exportConfig) ?? {},
      status,
      exported_by: optionalString(body.exportedBy) ?? (status === "exported" ? userId : null),
      exported_at: optionalString(body.exportedAt) ?? null,
    },
  };
}

export function dbToReportJob(row: Row): ReportJob {
  return {
    id: String(row.id),
    reportProjectId: String(row.report_project_id),
    jobType: row.job_type as ReportJobType,
    status: row.status as ReportJobStatus,
    progressPercent: Number(row.progress_percent),
    currentStep: String(row.current_step),
    totalSteps: Number(row.total_steps),
    completedSteps: Number(row.completed_steps),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    jobPayload: (row.job_payload ?? {}) as Record<string, unknown>,
    startedAt: row.started_at ? String(row.started_at) : undefined,
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function buildReportJobInsert(body: JsonObject): { data?: JsonObject; error?: string } {
  if (!isOneOf(body.jobType, REPORT_JOB_TYPES)) return { error: "Invalid job type" };
  return {
    data: {
      report_project_id: optionalString(body.reportProjectId) ?? null,
      job_type: body.jobType,
      status: "queued",
      progress_percent: 0,
      current_step: optionalString(body.currentStep) ?? "Queued",
      total_steps: typeof body.totalSteps === "number" && body.totalSteps > 0 ? body.totalSteps : 1,
      completed_steps: 0,
      error_message: null,
      job_payload: optionalJsonObject(body.jobPayload) ?? {},
      started_at: body.startedAt === null ? null : (optionalString(body.startedAt) ?? null),
      finished_at: null,
    },
  };
}

export function buildReportJobPatch(body: JsonObject): { data?: JsonObject; error?: string } {
  const patch: JsonObject = {};
  if (body.status !== undefined) {
    if (!isOneOf(body.status, REPORT_JOB_STATUSES)) return { error: "Invalid job status" };
    patch.status = body.status;
  }
  if (body.progressPercent !== undefined) {
    const pct = typeof body.progressPercent === "number" ? body.progressPercent : Number(body.progressPercent);
    if (pct < 0 || pct > 100) return { error: "progressPercent must be 0-100" };
    patch.progress_percent = pct;
  }
  if (body.currentStep !== undefined) patch.current_step = String(body.currentStep);
  if (body.totalSteps !== undefined) {
    const total = typeof body.totalSteps === "number" ? body.totalSteps : Number(body.totalSteps);
    if (total < 1) return { error: "totalSteps must be > 0" };
    patch.total_steps = total;
  }
  if (body.completedSteps !== undefined) {
    const completed = typeof body.completedSteps === "number" ? body.completedSteps : Number(body.completedSteps);
    if (completed < 0) return { error: "completedSteps must be >= 0" };
    patch.completed_steps = completed;
  }
  if (body.errorMessage !== undefined) patch.error_message = optionalString(body.errorMessage) ?? null;
  if (body.finishedAt !== undefined) patch.finished_at = optionalString(body.finishedAt) ?? null;
  return Object.keys(patch).length === 0 ? { error: "No fields to update" } : { data: patch };
}

export function buildReportExportPatch(body: JsonObject): { data?: JsonObject; error?: string } {
  const patch: JsonObject = {};
  if (body.reportBlueprintId !== undefined) patch.report_blueprint_id = optionalString(body.reportBlueprintId) ?? null;
  if (body.format !== undefined) {
    if (!isOneOf(body.format, REPORT_EXPORT_FORMATS)) return { error: "Invalid export format" };
    patch.format = body.format;
  }
  if (body.fileUrl !== undefined) patch.file_url = optionalString(body.fileUrl) ?? null;
  if (body.filePath !== undefined) patch.file_path = optionalString(body.filePath) ?? null;
  if (body.exportConfig !== undefined) {
    const exportConfig = optionalJsonObject(body.exportConfig);
    if (!exportConfig) return { error: "exportConfig must be an object" };
    patch.export_config = exportConfig;
  }
  if (body.status !== undefined) {
    if (!isOneOf(body.status, REPORT_EXPORT_STATUSES)) return { error: "Invalid status" };
    patch.status = body.status;
  }
  if (body.exportedBy !== undefined) patch.exported_by = optionalString(body.exportedBy) ?? null;
  if (body.exportedAt !== undefined) patch.exported_at = optionalString(body.exportedAt) ?? null;
  return Object.keys(patch).length === 0 ? { error: "No fields to update" } : { data: patch };
}
