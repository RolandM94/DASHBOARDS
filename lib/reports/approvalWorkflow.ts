import {
  REPORT_PROJECT_COLUMNS,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import { dbToReportProject } from "@/lib/reports/models";
import {
  assertCanExportReport,
  assertReportStatusTransition,
  roleHasReportPermission,
  targetStatusForWorkflowAction,
  type ReportPermission,
  type ReportWorkflowAction,
} from "@/lib/reports/approvalWorkflowCore";
import type { ReportProject, ReportProjectStatus } from "@/types";

type JsonObject = Record<string, unknown>;

interface ReportProjectRow {
  id: string;
  name: string;
  source_type: "dashboard" | "canvas";
  source_dashboard_id?: string | null;
  source_canvas_id?: string | null;
  report_type: string;
  status: ReportProjectStatus;
  workflow_enabled?: boolean | null;
  review_requested_by?: string | null;
  review_requested_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  locked_by?: string | null;
  locked_at?: string | null;
  created_by: string;
}

async function getProjectRow(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<ReportProjectRow> {
  const { data, error } = await supabase
    .from("report_projects")
    .select(REPORT_PROJECT_COLUMNS)
    .eq("id", reportProjectId)
    .single();

  if (error || !data) throw new Error("Report project not found");
  return data as ReportProjectRow;
}

async function getUserOrgRole(
  supabase: SupabaseRouteClient,
  userId: string,
  projectOwnerId: string
): Promise<string | undefined> {
  if (userId === projectOwnerId) return "owner";

  const [{ data: userProfile }, { data: ownerProfile }] = await Promise.all([
    supabase.from("profiles").select("org_id").eq("id", userId).maybeSingle(),
    supabase.from("profiles").select("org_id").eq("id", projectOwnerId).maybeSingle(),
  ]);
  const userOrgId = userProfile?.org_id ? String(userProfile.org_id) : undefined;
  const ownerOrgId = ownerProfile?.org_id ? String(ownerProfile.org_id) : undefined;
  if (!userOrgId || userOrgId !== ownerOrgId) return undefined;

  const { data: member } = await supabase
    .from("org_members")
    .select("role, status")
    .eq("org_id", userOrgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  return member?.role ? String(member.role) : undefined;
}

async function requireReportPermission(
  supabase: SupabaseRouteClient,
  project: ReportProjectRow,
  userId: string,
  permission: ReportPermission
): Promise<string> {
  const role = await getUserOrgRole(supabase, userId, project.created_by);
  if (!role || !roleHasReportPermission(role, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
  return role;
}

function ensureUnlocked(project: ReportProjectRow): void {
  if (project.locked_at) throw new Error("Report is locked");
}

async function updateProject(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  patch: JsonObject
): Promise<ReportProject> {
  const { data, error } = await supabase
    .from("report_projects")
    .update(patch)
    .eq("id", reportProjectId)
    .select(REPORT_PROJECT_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Report project could not be updated");
  return dbToReportProject(data);
}

export async function configureReportWorkflow(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId: string,
  enabled: boolean
): Promise<ReportProject> {
  const project = await getProjectRow(supabase, reportProjectId);
  await requireReportPermission(supabase, project, userId, "report:edit_blueprint");
  ensureUnlocked(project);
  return updateProject(supabase, reportProjectId, { workflow_enabled: enabled });
}

export async function submitReportForReview(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId: string
): Promise<ReportProject> {
  const project = await getProjectRow(supabase, reportProjectId);
  await requireReportPermission(supabase, project, userId, "report:edit_sections");
  ensureUnlocked(project);
  const nextStatus = targetStatusForWorkflowAction("submit_review", project.status);
  assertReportStatusTransition(project.status, nextStatus);

  return updateProject(supabase, reportProjectId, {
    workflow_enabled: true,
    status: nextStatus,
    review_requested_by: userId,
    review_requested_at: new Date().toISOString(),
  });
}

export async function requestReportChanges(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId: string,
  reason?: string
): Promise<ReportProject> {
  const project = await getProjectRow(supabase, reportProjectId);
  await requireReportPermission(supabase, project, userId, "report:approve_report");
  ensureUnlocked(project);
  const nextStatus = targetStatusForWorkflowAction("request_changes", project.status);
  assertReportStatusTransition(project.status, nextStatus);

  return updateProject(supabase, reportProjectId, {
    status: nextStatus,
    approved_by: null,
    approved_at: null,
    review_requested_by: null,
    review_requested_at: null,
    // The reason is logged by the route; the project row keeps workflow state compact.
    ...(reason ? {} : {}),
  });
}

export async function approveReport(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId: string
): Promise<ReportProject> {
  const project = await getProjectRow(supabase, reportProjectId);
  await requireReportPermission(supabase, project, userId, "report:approve_report");
  ensureUnlocked(project);
  const nextStatus = targetStatusForWorkflowAction("approve_report", project.status);
  assertReportStatusTransition(project.status, nextStatus);

  return updateProject(supabase, reportProjectId, {
    workflow_enabled: true,
    status: nextStatus,
    approved_by: userId,
    approved_at: new Date().toISOString(),
  });
}

export async function lockReport(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId: string
): Promise<ReportProject> {
  const project = await getProjectRow(supabase, reportProjectId);
  await requireReportPermission(supabase, project, userId, "report:approve_report");
  if (project.status !== "approved" && project.status !== "exported") {
    throw new Error("Only approved or exported reports can be locked");
  }

  return updateProject(supabase, reportProjectId, {
    locked_by: userId,
    locked_at: new Date().toISOString(),
  });
}

export async function assertReportExportAllowed(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  userId: string
): Promise<void> {
  const project = await getProjectRow(supabase, reportProjectId);
  await requireReportPermission(supabase, project, userId, "report:export");
  assertCanExportReport({
    workflowEnabled: Boolean(project.workflow_enabled),
    status: project.status,
  });
}

export async function markReportExported(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<void> {
  const project = await getProjectRow(supabase, reportProjectId);
  const nextStatus = targetStatusForWorkflowAction("export_report", project.status);
  assertReportStatusTransition(project.status, nextStatus);
  await updateProject(supabase, reportProjectId, { status: nextStatus });
}
