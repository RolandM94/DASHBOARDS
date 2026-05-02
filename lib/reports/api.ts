import { createClient } from "@/lib/supabase/server";

export const REPORT_PROJECT_COLUMNS =
  "id, name, description, source_type, source_dashboard_id, source_canvas_id, report_type, status, workflow_enabled, review_requested_by, review_requested_at, approved_by, approved_at, locked_by, locked_at, created_by, created_at, updated_at";

export const REPORT_BLUEPRINT_COLUMNS =
  "id, report_project_id, version, status, title, objective, audience, blueprint_json, generated_by_ai, approved_by, approved_at, created_at, updated_at";

export const REPORT_SECTION_COLUMNS =
  "id, report_project_id, report_blueprint_id, parent_section_id, section_key, title, section_type, order_index, source_widget_ids, source_worksheet_ids, source_insight_ids, section_prompt, section_config, status, generated_content, edited_content, metadata, created_at, updated_at";

export const REPORT_EXPORT_COLUMNS =
  "id, report_project_id, report_blueprint_id, format, file_url, file_path, export_config, status, exported_by, exported_at, created_at";

export const REPORT_SOURCE_SNAPSHOT_COLUMNS =
  "id, report_project_id, source_type, source_id, active_filters_snapshot, widgets_snapshot, worksheets_snapshot, insights_snapshot, query_outputs_snapshot, metadata, created_at";

export const REPORT_COMPILATION_COLUMNS =
  "id, report_project_id, report_blueprint_id, source_snapshot_id, title, compiled_payload, status, compiled_by, created_at, updated_at";

export const REPORT_GENERATION_LOG_COLUMNS =
  "id, report_project_id, user_id, action_type, input_payload, output_summary, ai_model, status, error_message, created_at";

export const REPORT_JOB_COLUMNS =
  "id, report_project_id, job_type, status, progress_percent, current_step, total_steps, completed_steps, error_message, started_at, finished_at, created_at, updated_at";

export type SupabaseRouteClient = Awaited<ReturnType<typeof createClient>>;

export async function logReportAction(
  supabase: SupabaseRouteClient,
  userId: string,
  actionType: string,
  options: {
    reportProjectId?: string;
    inputPayload?: Record<string, unknown>;
    outputSummary?: Record<string, unknown>;
    aiModel?: string;
    status?: "pending" | "success" | "failed";
    errorMessage?: string;
  } = {}
) {
  await supabase.from("report_generation_logs").insert({
    report_project_id: options.reportProjectId ?? null,
    user_id: userId,
    action_type: actionType,
    input_payload: options.inputPayload ?? {},
    output_summary: options.outputSummary ?? {},
    ai_model: options.aiModel ?? null,
    status: options.status ?? "success",
    error_message: options.errorMessage ?? null,
  });
}
