import {
  REPORT_BLUEPRINT_COLUMNS,
  REPORT_COMPILATION_COLUMNS,
  REPORT_PROJECT_COLUMNS,
  REPORT_SECTION_COLUMNS,
  REPORT_SOURCE_SNAPSHOT_COLUMNS,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import { dbToReportCompilation } from "@/lib/reports/models";
import {
  buildCompiledReportPayload,
  type CompileReportOptions,
  type CompiledReportPayload,
  type ReportCompilerBlueprintRow,
  type ReportCompilerProjectRow,
  type ReportCompilerSectionRow,
  type ReportCompilerSnapshotRow,
} from "@/lib/reports/reportCompilerCore";
import type { ReportCompilation } from "@/types";

export interface CompileReportServiceOptions extends CompileReportOptions {
  blueprintId?: string;
  compiledBy?: string;
  allowPreview?: boolean;
  userId?: string;
}

export interface CompileReportResult {
  compilation: ReportCompilation;
  payload: CompiledReportPayload;
}

async function getProject(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId?: string
): Promise<ReportCompilerProjectRow> {
  let query = supabase
    .from("report_projects")
    .select(REPORT_PROJECT_COLUMNS)
    .eq("id", reportProjectId);

  if (userId) query = query.eq("created_by", userId);

  const { data, error } = await query.single();

  if (error || !data) throw new Error("Report project not found");
  return data as ReportCompilerProjectRow;
}

async function getBlueprint(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  blueprintId?: string,
  allowPreview?: boolean
): Promise<ReportCompilerBlueprintRow> {
  let query = supabase
    .from("report_blueprints")
    .select(REPORT_BLUEPRINT_COLUMNS)
    .eq("report_project_id", reportProjectId);

  if (blueprintId) {
    query = query.eq("id", blueprintId);
  } else if (allowPreview) {
    query = query.order("version", { ascending: false }).limit(1);
  } else {
    query = query.in("status", ["approved", "locked"]).order("version", { ascending: false }).limit(1);
  }

  const { data, error } = await query.single();
  if (error || !data) throw new Error("Report blueprint not found");

  const blueprint = data as ReportCompilerBlueprintRow;
  if (!allowPreview && blueprint.status !== "approved" && blueprint.status !== "locked") {
    throw new Error("Report can only be compiled from an approved or locked blueprint");
  }

  return blueprint;
}

async function getLatestSnapshot(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<ReportCompilerSnapshotRow> {
  const { data, error } = await supabase
    .from("report_source_snapshots")
    .select(REPORT_SOURCE_SNAPSHOT_COLUMNS)
    .eq("report_project_id", reportProjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) throw new Error("No source snapshot found for this report project");
  return data as ReportCompilerSnapshotRow;
}

async function getSections(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  blueprintId: string
): Promise<ReportCompilerSectionRow[]> {
  const { data, error } = await supabase
    .from("report_sections")
    .select(REPORT_SECTION_COLUMNS)
    .eq("report_project_id", reportProjectId)
    .eq("report_blueprint_id", blueprintId)
    .order("order_index", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ReportCompilerSectionRow[];
}

export async function compileReport(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  options: CompileReportServiceOptions = {}
): Promise<CompileReportResult> {
  const project = await getProject(supabase, reportProjectId, options.userId);
  const blueprint = await getBlueprint(supabase, reportProjectId, options.blueprintId, options.allowPreview);
  const [snapshot, sections] = await Promise.all([
    getLatestSnapshot(supabase, reportProjectId),
    getSections(supabase, reportProjectId, blueprint.id),
  ]);

  if (sections.length === 0) throw new Error("No report sections found for this blueprint");

  const payload = buildCompiledReportPayload(project, blueprint, sections, snapshot, {
    includeAppendices: options.includeAppendices,
  });

  await supabase
    .from("report_compilations")
    .update({ status: "superseded" })
    .eq("report_project_id", reportProjectId)
    .eq("report_blueprint_id", blueprint.id)
    .eq("status", "compiled");

  const { data, error } = await supabase
    .from("report_compilations")
    .insert({
      report_project_id: reportProjectId,
      report_blueprint_id: blueprint.id,
      source_snapshot_id: snapshot.id,
      title: payload.title,
      compiled_payload: payload,
      status: "compiled",
      compiled_by: options.compiledBy ?? null,
    })
    .select(REPORT_COMPILATION_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Compiled report could not be stored");

  await supabase
    .from("report_projects")
    .update({ status: "generated" })
    .eq("id", reportProjectId)
    .in("status", ["draft", "blueprint_generated", "blueprint_approved", "generating", "generated", "failed"]);

  return {
    compilation: dbToReportCompilation(data),
    payload,
  };
}
