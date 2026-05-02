import {
  REPORT_BLUEPRINT_COLUMNS,
  REPORT_COMPILATION_COLUMNS,
  REPORT_EXPORT_COLUMNS,
  REPORT_GENERATION_LOG_COLUMNS,
  REPORT_PROJECT_COLUMNS,
  REPORT_SECTION_COLUMNS,
  REPORT_SOURCE_SNAPSHOT_COLUMNS,
  logReportAction,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import {
  buildReportAuditTrail,
  compareReportVersionsFromRows,
  type AuditBlueprintRow,
  type AuditCompilationRow,
  type AuditExportRow,
  type AuditLogRow,
  type AuditProjectRow,
  type AuditSectionRow,
  type AuditSnapshotRow,
  type JsonObject,
  type ReportAuditTrail,
  type ReportVersionComparison,
} from "@/lib/reports/auditTrailCore";

export async function createGenerationLog(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId: string,
  actionType: string,
  payload: JsonObject = {},
  status: "pending" | "success" | "failed" = "success"
): Promise<void> {
  await logReportAction(supabase, userId, actionType, {
    reportProjectId,
    inputPayload: payload,
    status,
    errorMessage: typeof payload.error_message === "string" ? payload.error_message : undefined,
    aiModel: typeof payload.ai_model === "string" ? payload.ai_model : undefined,
  });
}

async function loadAuditRows(supabase: SupabaseRouteClient, reportProjectId: string) {
  const [
    projectResult,
    snapshotsResult,
    blueprintsResult,
    sectionsResult,
    compilationsResult,
    exportsResult,
    logsResult,
  ] = await Promise.all([
    supabase
      .from("report_projects")
      .select(REPORT_PROJECT_COLUMNS)
      .eq("id", reportProjectId)
      .single(),
    supabase
      .from("report_source_snapshots")
      .select(REPORT_SOURCE_SNAPSHOT_COLUMNS)
      .eq("report_project_id", reportProjectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_blueprints")
      .select(REPORT_BLUEPRINT_COLUMNS)
      .eq("report_project_id", reportProjectId)
      .order("version", { ascending: false }),
    supabase
      .from("report_sections")
      .select(REPORT_SECTION_COLUMNS)
      .eq("report_project_id", reportProjectId)
      .order("order_index", { ascending: true }),
    supabase
      .from("report_compilations")
      .select(REPORT_COMPILATION_COLUMNS)
      .eq("report_project_id", reportProjectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_exports")
      .select(REPORT_EXPORT_COLUMNS)
      .eq("report_project_id", reportProjectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_generation_logs")
      .select(REPORT_GENERATION_LOG_COLUMNS)
      .eq("report_project_id", reportProjectId)
      .order("created_at", { ascending: false }),
  ]);

  if (projectResult.error || !projectResult.data) throw new Error("Report project not found");
  if (snapshotsResult.error) throw new Error(snapshotsResult.error.message);
  if (blueprintsResult.error) throw new Error(blueprintsResult.error.message);
  if (sectionsResult.error) throw new Error(sectionsResult.error.message);
  if (compilationsResult.error) throw new Error(compilationsResult.error.message);
  if (exportsResult.error) throw new Error(exportsResult.error.message);
  if (logsResult.error) throw new Error(logsResult.error.message);

  return {
    project: projectResult.data as AuditProjectRow,
    snapshots: (snapshotsResult.data ?? []) as AuditSnapshotRow[],
    blueprints: (blueprintsResult.data ?? []) as AuditBlueprintRow[],
    sections: (sectionsResult.data ?? []) as AuditSectionRow[],
    compilations: (compilationsResult.data ?? []) as AuditCompilationRow[],
    exports: (exportsResult.data ?? []) as AuditExportRow[],
    logs: (logsResult.data ?? []) as AuditLogRow[],
  };
}

export async function getReportAuditTrail(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<ReportAuditTrail> {
  return buildReportAuditTrail(await loadAuditRows(supabase, reportProjectId));
}

export async function compareReportVersions(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  versionA: number,
  versionB: number
): Promise<ReportVersionComparison> {
  const rows = await loadAuditRows(supabase, reportProjectId);
  return compareReportVersionsFromRows({
    reportProjectId,
    versionA,
    versionB,
    blueprints: rows.blueprints,
    sections: rows.sections,
    compilations: rows.compilations,
  });
}
