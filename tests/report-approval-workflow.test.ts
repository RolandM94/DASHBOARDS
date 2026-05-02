import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanExportReport,
  assertReportStatusTransition,
  canTransitionReportStatus,
  permissionsForReportRole,
  roleHasReportPermission,
  targetStatusForWorkflowAction,
} from "../lib/reports/approvalWorkflowCore.ts";

test("approval workflow allows the planned project status transitions", () => {
  assert.equal(canTransitionReportStatus("draft", "blueprint_generated"), true);
  assert.equal(canTransitionReportStatus("blueprint_generated", "blueprint_approved"), true);
  assert.equal(canTransitionReportStatus("blueprint_approved", "generating"), true);
  assert.equal(canTransitionReportStatus("generating", "generated"), true);
  assert.equal(canTransitionReportStatus("generated", "review"), true);
  assert.equal(canTransitionReportStatus("review", "approved"), true);
  assert.equal(canTransitionReportStatus("approved", "exported"), true);
  assert.equal(canTransitionReportStatus("review", "draft"), false);
});

test("approval workflow action helper maps review actions to statuses", () => {
  assert.equal(targetStatusForWorkflowAction("submit_review", "generated"), "review");
  assert.equal(targetStatusForWorkflowAction("request_changes", "review"), "generated");
  assert.equal(targetStatusForWorkflowAction("approve_report", "review"), "approved");
  assert.equal(targetStatusForWorkflowAction("export_report", "approved"), "exported");
});

test("approval workflow throws on invalid transitions", () => {
  assert.throws(
    () => assertReportStatusTransition("draft", "approved"),
    /Invalid report status transition/
  );
});

test("approval workflow permissions distinguish approvers from editors and viewers", () => {
  assert.equal(roleHasReportPermission("owner", "report:approve_report"), true);
  assert.equal(roleHasReportPermission("admin", "report:approve_report"), true);
  assert.equal(roleHasReportPermission("editor", "report:approve_report"), false);
  assert.equal(roleHasReportPermission("viewer", "report:export"), false);
  assert.ok(permissionsForReportRole("member").includes("report:generate_sections"));
});

test("approval workflow blocks export when approval is required", () => {
  assert.doesNotThrow(() => assertCanExportReport({ workflowEnabled: false, status: "generated" }));
  assert.doesNotThrow(() => assertCanExportReport({ workflowEnabled: true, status: "approved" }));
  assert.throws(
    () => assertCanExportReport({ workflowEnabled: true, status: "generated" }),
    /requires approval/
  );
  assert.throws(
    () => assertCanExportReport({ workflowEnabled: false, status: "draft" }),
    /Only generated or approved/
  );
});
