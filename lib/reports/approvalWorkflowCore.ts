import type { ReportProjectStatus } from "@/types";

export type ReportPermission =
  | "report:create"
  | "report:generate_blueprint"
  | "report:edit_blueprint"
  | "report:approve_blueprint"
  | "report:generate_sections"
  | "report:edit_sections"
  | "report:approve_report"
  | "report:export"
  | "report:delete";

export type ReportWorkflowAction =
  | "submit_review"
  | "request_changes"
  | "approve_report"
  | "lock_report"
  | "export_report"
  | "fail_report";

const ROLE_PERMISSIONS: Record<string, ReportPermission[]> = {
  owner: [
    "report:create",
    "report:generate_blueprint",
    "report:edit_blueprint",
    "report:approve_blueprint",
    "report:generate_sections",
    "report:edit_sections",
    "report:approve_report",
    "report:export",
    "report:delete",
  ],
  admin: [
    "report:create",
    "report:generate_blueprint",
    "report:edit_blueprint",
    "report:approve_blueprint",
    "report:generate_sections",
    "report:edit_sections",
    "report:approve_report",
    "report:export",
    "report:delete",
  ],
  editor: [
    "report:create",
    "report:generate_blueprint",
    "report:edit_blueprint",
    "report:generate_sections",
    "report:edit_sections",
    "report:export",
  ],
  member: [
    "report:create",
    "report:generate_blueprint",
    "report:edit_blueprint",
    "report:generate_sections",
    "report:edit_sections",
    "report:export",
  ],
  viewer: [],
};

const ALLOWED_TRANSITIONS: Record<ReportProjectStatus, ReportProjectStatus[]> = {
  draft: ["blueprint_generated", "failed"],
  blueprint_generated: ["blueprint_approved", "failed"],
  blueprint_approved: ["generating", "failed"],
  generating: ["generated", "failed"],
  generated: ["review", "exported", "failed"],
  review: ["generated", "approved", "failed"],
  approved: ["exported", "review", "failed"],
  exported: ["archived"],
  archived: [],
  failed: [],
};

export function permissionsForReportRole(role: string): ReportPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasReportPermission(role: string, permission: ReportPermission): boolean {
  return permissionsForReportRole(role).includes(permission);
}

export function canTransitionReportStatus(from: ReportProjectStatus, to: ReportProjectStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from]?.includes(to) === true;
}

export function assertReportStatusTransition(from: ReportProjectStatus, to: ReportProjectStatus): void {
  if (!canTransitionReportStatus(from, to)) {
    throw new Error(`Invalid report status transition: ${from} -> ${to}`);
  }
}

export function targetStatusForWorkflowAction(
  action: ReportWorkflowAction,
  currentStatus: ReportProjectStatus
): ReportProjectStatus {
  if (action === "submit_review") return "review";
  if (action === "request_changes") return "generated";
  if (action === "approve_report") return "approved";
  if (action === "export_report") return "exported";
  if (action === "fail_report") return "failed";
  return currentStatus;
}

export function assertCanExportReport(input: {
  workflowEnabled: boolean;
  status: ReportProjectStatus;
}): void {
  if (input.status !== "generated" && input.status !== "approved" && input.status !== "exported") {
    throw new Error("Only generated or approved reports can be exported");
  }
  if (input.workflowEnabled && input.status !== "approved" && input.status !== "exported") {
    throw new Error("This report requires approval before export");
  }
}
