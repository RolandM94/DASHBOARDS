import assert from "node:assert/strict";
import test from "node:test";
import {
  isOneOf,
  optionalString,
  optionalStringArray,
  optionalJsonObject,
  dbToReportProject,
  dbToReportSourceSnapshot,
  dbToReportBlueprint,
  dbToReportSection,
  dbToReportExport,
  dbToReportCompilation,
  dbToReportJob,
  buildReportProjectInsert,
  buildReportProjectPatch,
  buildReportBlueprintInsert,
  buildReportBlueprintPatch,
  buildReportSectionInsert,
  buildReportSectionPatch,
  buildReportExportInsert,
  buildReportExportPatch,
  buildReportJobInsert,
  buildReportJobPatch,
} from "../lib/reports/models.ts";

// ── isOneOf ──────────────────────────────────────────────────────────────────

test("isOneOf returns true for valid values", () => {
  assert.equal(isOneOf("dashboard", ["dashboard", "canvas"]), true);
  assert.equal(isOneOf("management_report", ["executive_summary", "management_report", "technical_report", "custom_report"]), true);
});

test("isOneOf returns false for invalid values", () => {
  assert.equal(isOneOf("invalid", ["dashboard", "canvas"]), false);
  assert.equal(isOneOf(42, ["a", "b"]), false);
  assert.equal(isOneOf(undefined, ["a", "b"]), false);
});

// ── optionalString ───────────────────────────────────────────────────────────

test("optionalString returns undefined for null/undefined", () => {
  assert.equal(optionalString(undefined), undefined);
  assert.equal(optionalString(null), undefined);
});

test("optionalString returns trimmed string for valid input", () => {
  assert.equal(optionalString("  hello  "), "hello");
  assert.equal(optionalString("hello"), "hello");
});

test("optionalString returns undefined for non-string types", () => {
  assert.equal(optionalString(42), undefined);
  assert.equal(optionalString({}), undefined);
  assert.equal(optionalString([]), undefined);
});

test("optionalString returns undefined for empty string after trim", () => {
  assert.equal(optionalString("   "), undefined);
  assert.equal(optionalString(""), undefined);
});

// ── optionalStringArray ──────────────────────────────────────────────────────

test("optionalStringArray returns undefined for undefined", () => {
  assert.equal(optionalStringArray(undefined), undefined);
});

test("optionalStringArray returns undefined for non-array values", () => {
  assert.equal(optionalStringArray("not-array"), undefined);
  assert.equal(optionalStringArray(42), undefined);
  assert.equal(optionalStringArray({}), undefined);
});

test("optionalStringArray filters out non-string and empty items", () => {
  assert.deepEqual(optionalStringArray(["a", "b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(optionalStringArray(["a", 42, "", "c"]), ["a", "c"]);
});

test("optionalStringArray returns empty array for all-invalid items", () => {
  assert.deepEqual(optionalStringArray([42, null, undefined]), []);
});

// ── optionalJsonObject ───────────────────────────────────────────────────────

test("optionalJsonObject returns undefined for undefined", () => {
  assert.equal(optionalJsonObject(undefined), undefined);
});

test("optionalJsonObject returns undefined for null/array/primitives", () => {
  assert.equal(optionalJsonObject(null), undefined);
  assert.equal(optionalJsonObject([]), undefined);
  assert.equal(optionalJsonObject("string"), undefined);
  assert.equal(optionalJsonObject(42), undefined);
});

test("optionalJsonObject returns the object for valid plain objects", () => {
  assert.deepEqual(optionalJsonObject({ key: "value" }), { key: "value" });
  assert.deepEqual(optionalJsonObject({}), {});
});

// ── dbToReportProject ────────────────────────────────────────────────────────

test("dbToReportProject maps a database row correctly", () => {
  const project = dbToReportProject({
    id: "p1",
    name: "Test Report",
    description: "A report",
    source_type: "dashboard",
    source_dashboard_id: "d-1",
    source_canvas_id: null,
    template_id: "tpl-1",
    report_type: "management_report",
    status: "draft",
    workflow_enabled: false,
    review_requested_by: null,
    review_requested_at: null,
    approved_by: null,
    approved_at: null,
    locked_by: null,
    locked_at: null,
    created_by: "u1",
    created_at: "2026-05-01T08:00:00Z",
    updated_at: "2026-05-01T08:30:00Z",
  });

  assert.equal(project.id, "p1");
  assert.equal(project.name, "Test Report");
  assert.equal(project.description, "A report");
  assert.equal(project.sourceType, "dashboard");
  assert.equal(project.sourceDashboardId, "d-1");
  assert.equal(project.sourceCanvasId, undefined);
  assert.equal(project.templateId, "tpl-1");
  assert.equal(project.reportType, "management_report");
  assert.equal(project.status, "draft");
  assert.equal(project.createdBy, "u1");
});

// ── dbToReportSourceSnapshot ─────────────────────────────────────────────────

test("dbToReportSourceSnapshot maps a database row correctly", () => {
  const snapshot = dbToReportSourceSnapshot({
    id: "s1",
    report_project_id: "p1",
    source_type: "canvas",
    source_id: "c-1",
    active_filters_snapshot: { region: ["North"] },
    widgets_snapshot: [{ id: "w1" }],
    worksheets_snapshot: [{ id: "ws1" }],
    insights_snapshot: [],
    query_outputs_snapshot: {},
    metadata: { source: { title: "Canvas" } },
    created_at: "2026-05-01T09:00:00Z",
  });

  assert.equal(snapshot.id, "s1");
  assert.equal(snapshot.reportProjectId, "p1");
  assert.equal(snapshot.sourceType, "canvas");
  assert.equal(snapshot.sourceId, "c-1");
  assert.deepEqual(snapshot.activeFiltersSnapshot, { region: ["North"] });
  assert.deepEqual(snapshot.widgetsSnapshot, [{ id: "w1" }]);
  assert.deepEqual(snapshot.metadata, { source: { title: "Canvas" } });
});

// ── dbToReportBlueprint ──────────────────────────────────────────────────────

test("dbToReportBlueprint maps a database row correctly", () => {
  const bp = dbToReportBlueprint({
    id: "b1",
    report_project_id: "p1",
    version: 2,
    status: "approved",
    title: "Quarterly Report",
    objective: "Summarize Q1",
    audience: "Leadership",
    blueprint_json: { sections: [] },
    generated_by_ai: true,
    approved_by: "u1",
    approved_at: "2026-05-01T10:00:00Z",
    created_at: "2026-05-01T09:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
  });

  assert.equal(bp.id, "b1");
  assert.equal(bp.reportProjectId, "p1");
  assert.equal(bp.version, 2);
  assert.equal(bp.status, "approved");
  assert.equal(bp.title, "Quarterly Report");
  assert.equal(bp.objective, "Summarize Q1");
  assert.equal(bp.audience, "Leadership");
  assert.equal(bp.generatedByAi, true);
  assert.equal(bp.approvedBy, "u1");
});

// ── dbToReportSection ────────────────────────────────────────────────────────

test("dbToReportSection maps a database row correctly", () => {
  const section = dbToReportSection({
    id: "sec1",
    report_project_id: "p1",
    report_blueprint_id: "b1",
    parent_section_id: null,
    section_key: "executive-summary",
    title: "Executive Summary",
    section_type: "executive_summary",
    order_index: 1,
    source_widget_ids: ["w1", "w2"],
    source_worksheet_ids: ["ws1"],
    source_insight_ids: [],
    section_prompt: "Summarize findings",
    section_config: { depth: "short" },
    status: "generated",
    generated_content: "Generated text",
    edited_content: null,
    metadata: {},
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-01T11:00:00Z",
  });

  assert.equal(section.id, "sec1");
  assert.equal(section.sectionKey, "executive-summary");
  assert.equal(section.sectionType, "executive_summary");
  assert.equal(section.orderIndex, 1);
  assert.deepEqual(section.sourceWidgetIds, ["w1", "w2"]);
  assert.equal(section.generatedContent, "Generated text");
  assert.equal(section.editedContent, undefined);
});

// ── dbToReportExport ─────────────────────────────────────────────────────────

test("dbToReportExport maps a database row correctly", () => {
  const exp = dbToReportExport({
    id: "e1",
    report_project_id: "p1",
    report_blueprint_id: "b1",
    format: "pdf",
    file_url: "/download/e1.pdf",
    file_path: "exports/e1.pdf",
    export_config: { include_appendix: true },
    status: "exported",
    exported_by: "u1",
    exported_at: "2026-05-01T12:00:00Z",
    created_at: "2026-05-01T11:30:00Z",
  });

  assert.equal(exp.id, "e1");
  assert.equal(exp.format, "pdf");
  assert.equal(exp.fileUrl, "/download/e1.pdf");
  assert.equal(exp.status, "exported");
  assert.equal(exp.exportedBy, "u1");
});

test("dbToReportExport handles null optional fields", () => {
  const exp = dbToReportExport({
    id: "e2",
    report_project_id: "p1",
    report_blueprint_id: null,
    format: "docx",
    file_url: null,
    file_path: null,
    export_config: {},
    status: "pending",
    exported_by: null,
    exported_at: null,
    created_at: "2026-05-01T11:30:00Z",
  });

  assert.equal(exp.reportBlueprintId, undefined);
  assert.equal(exp.fileUrl, undefined);
  assert.equal(exp.exportedBy, undefined);
  assert.equal(exp.exportedAt, undefined);
});

// ── dbToReportCompilation ────────────────────────────────────────────────────

test("dbToReportCompilation maps a database row correctly", () => {
  const comp = dbToReportCompilation({
    id: "comp1",
    report_project_id: "p1",
    report_blueprint_id: "b1",
    source_snapshot_id: "s1",
    title: "Q1 Report v2",
    compiled_payload: { sections: [] },
    status: "compiled",
    compiled_by: "u1",
    created_at: "2026-05-01T11:00:00Z",
    updated_at: "2026-05-01T11:00:00Z",
  });

  assert.equal(comp.id, "comp1");
  assert.equal(comp.reportBlueprintId, "b1");
  assert.equal(comp.sourceSnapshotId, "s1");
  assert.equal(comp.title, "Q1 Report v2");
  assert.equal(comp.compiledBy, "u1");
});

// ── dbToReportJob ────────────────────────────────────────────────────────────

test("dbToReportJob maps a database row correctly", () => {
  const job = dbToReportJob({
    id: "j1",
    report_project_id: "p1",
    job_type: "generate_all_sections",
    status: "running",
    progress_percent: 50,
    current_step: "Generating section 3 of 6",
    total_steps: 6,
    completed_steps: 3,
    error_message: null,
    started_at: "2026-05-01T08:00:00Z",
    finished_at: null,
    created_at: "2026-05-01T08:00:00Z",
    updated_at: "2026-05-01T08:05:00Z",
  });

  assert.equal(job.id, "j1");
  assert.equal(job.jobType, "generate_all_sections");
  assert.equal(job.status, "running");
  assert.equal(job.progressPercent, 50);
  assert.equal(job.currentStep, "Generating section 3 of 6");
  assert.equal(job.totalSteps, 6);
  assert.equal(job.completedSteps, 3);
  assert.equal(job.errorMessage, undefined);
  assert.equal(job.startedAt, "2026-05-01T08:00:00Z");
  assert.equal(job.finishedAt, undefined);
});

// ── buildReportProjectInsert ─────────────────────────────────────────────────

test("buildReportProjectInsert validates required name", () => {
  assert.equal(buildReportProjectInsert({}, "u1").error, "Report project name is required");
  assert.equal(buildReportProjectInsert({ name: "" }, "u1").error, "Report project name is required");
});

test("buildReportProjectInsert validates sourceType", () => {
  const result = buildReportProjectInsert({ name: "Test", sourceType: "invalid" }, "u1");
  assert.equal(result.error, "sourceType must be dashboard or canvas");
});

test("buildReportProjectInsert validates sourceDashboardId for dashboard type", () => {
  const result = buildReportProjectInsert({ name: "Test", sourceType: "dashboard" }, "u1");
  assert.equal(result.error, "sourceDashboardId is required for dashboard reports");
});

test("buildReportProjectInsert validates sourceCanvasId for canvas type", () => {
  const result = buildReportProjectInsert({ name: "Test", sourceType: "canvas" }, "u1");
  assert.equal(result.error, "sourceCanvasId is required for canvas reports");
});

test("buildReportProjectInsert creates valid insert for dashboard", () => {
  const result = buildReportProjectInsert({
    name: " Sales Report ",
    description: " A report ",
    sourceType: "dashboard",
    sourceDashboardId: "d-1",
    templateId: "tpl-1",
    reportType: "management_report",
  }, "u1");

  assert.equal(result.error, undefined);
  assert.equal(result.data.name, "Sales Report");
  assert.equal(result.data.description, "A report");
  assert.equal(result.data.source_type, "dashboard");
  assert.equal(result.data.source_dashboard_id, "d-1");
  assert.equal(result.data.source_canvas_id, null);
  assert.equal(result.data.template_id, "tpl-1");
  assert.equal(result.data.created_by, "u1");
  assert.equal(result.data.status, "draft");
});

test("buildReportProjectInsert creates valid insert for canvas", () => {
  const result = buildReportProjectInsert({
    name: "Canvas Report",
    sourceType: "canvas",
    sourceCanvasId: "c-1",
  }, "u1");

  assert.equal(result.error, undefined);
  assert.equal(result.data.source_type, "canvas");
  assert.equal(result.data.source_canvas_id, "c-1");
  assert.equal(result.data.source_dashboard_id, null);
});

test("buildReportProjectInsert defaults reportType to custom_report", () => {
  const result = buildReportProjectInsert({
    name: "Test",
    sourceType: "dashboard",
    sourceDashboardId: "d-1",
  }, "u1");

  assert.equal(result.data.report_type, "custom_report");
});

// ── buildReportProjectPatch ──────────────────────────────────────────────────

test("buildReportProjectPatch rejects empty name", () => {
  const result = buildReportProjectPatch({ name: "" });
  assert.equal(result.error, "Report project name cannot be empty");
});

test("buildReportProjectPatch returns error for no fields", () => {
  assert.equal(buildReportProjectPatch({}).error, "No fields to update");
});

test("buildReportProjectPatch patches name, description, reportType", () => {
  const result = buildReportProjectPatch({
    name: "Updated Name",
    description: "Updated desc",
    reportType: "technical_report",
  });

  assert.equal(result.data.name, "Updated Name");
  assert.equal(result.data.description, "Updated desc");
  assert.equal(result.data.report_type, "technical_report");
});

test("buildReportProjectPatch rejects invalid reportType", () => {
  const result = buildReportProjectPatch({ reportType: "invalid" });
  assert.equal(result.error, "Invalid reportType");
});

test("buildReportProjectPatch patches status and workflowEnabled", () => {
  const result = buildReportProjectPatch({
    status: "generated",
    workflowEnabled: true,
  });

  assert.equal(result.data.status, "generated");
  assert.equal(result.data.workflow_enabled, true);
});

test("buildReportProjectPatch rejects invalid status", () => {
  const result = buildReportProjectPatch({ status: "bogus" });
  assert.equal(result.error, "Invalid status");
});

// ── buildReportBlueprintInsert ──────────────────────────────────────────────

test("buildReportBlueprintInsert validates required title", () => {
  assert.equal(buildReportBlueprintInsert({}, "p1", 1).error, "Blueprint title is required");
  assert.equal(buildReportBlueprintInsert({ title: "" }, "p1", 1).error, "Blueprint title is required");
});

test("buildReportBlueprintInsert creates valid insert with defaults", () => {
  const result = buildReportBlueprintInsert({ title: "My Blueprint" }, "p1", 1);
  assert.equal(result.data.report_project_id, "p1");
  assert.equal(result.data.version, 1);
  assert.equal(result.data.status, "draft");
  assert.equal(result.data.title, "My Blueprint");
  assert.equal(result.data.generated_by_ai, false);
  assert.deepEqual(result.data.blueprint_json, {});
});

test("buildReportBlueprintInsert accepts all optional fields", () => {
  const result = buildReportBlueprintInsert({
    title: "Blueprint",
    status: "approved",
    objective: "Objective",
    audience: "Audience",
    blueprintJson: { sections: [] },
    generatedByAi: true,
    approvedBy: "u1",
    approvedAt: "2026-05-01T10:00:00Z",
  }, "p1", 3);

  assert.equal(result.data.status, "approved");
  assert.equal(result.data.objective, "Objective");
  assert.equal(result.data.audience, "Audience");
  assert.equal(result.data.generated_by_ai, true);
  assert.equal(result.data.approved_by, "u1");
});

// ── buildReportBlueprintPatch ────────────────────────────────────────────────

test("buildReportBlueprintPatch patches status and title", () => {
  const result = buildReportBlueprintPatch({ status: "locked", title: "Locked Title" });
  assert.equal(result.data.status, "locked");
  assert.equal(result.data.title, "Locked Title");
});

test("buildReportBlueprintPatch rejects invalid status", () => {
  assert.equal(buildReportBlueprintPatch({ status: "invalid" }).error, "Invalid status");
});

test("buildReportBlueprintPatch rejects empty title", () => {
  assert.equal(buildReportBlueprintPatch({ title: "" }).error, "Blueprint title cannot be empty");
});

test("buildReportBlueprintPatch returns error for no fields", () => {
  assert.equal(buildReportBlueprintPatch({}).error, "No fields to update");
});

// ── buildReportSectionInsert ────────────────────────────────────────────────

test("buildReportSectionInsert validates required fields", () => {
  assert.equal(buildReportSectionInsert({}, "p1").error, "sectionKey is required");
  assert.equal(buildReportSectionInsert({ sectionKey: "key" }, "p1").error, "Section title is required");
});

test("buildReportSectionInsert creates valid insert with all fields", () => {
  const result = buildReportSectionInsert({
    sectionKey: "exec-summary",
    title: "Executive Summary",
    sectionType: "executive_summary",
    orderIndex: 0,
    sourceWidgetIds: ["w1"],
    sourceWorksheetIds: ["ws1"],
    sourceInsightIds: [],
    sectionPrompt: "Summarize",
    sectionConfig: { depth: "short" },
    status: "pending",
  }, "p1");

  assert.equal(result.data.report_project_id, "p1");
  assert.equal(result.data.section_key, "exec-summary");
  assert.equal(result.data.title, "Executive Summary");
  assert.equal(result.data.section_type, "executive_summary");
  assert.equal(result.data.order_index, 0);
  assert.deepEqual(result.data.source_widget_ids, ["w1"]);
  assert.equal(result.data.status, "pending");
});

// ── buildReportSectionPatch ──────────────────────────────────────────────────

test("buildReportSectionPatch patches section content", () => {
  const result = buildReportSectionPatch({
    title: "Updated Title",
    status: "edited",
    generatedContent: "Content",
    editedContent: "Edited content",
  });

  assert.equal(result.data.title, "Updated Title");
  assert.equal(result.data.status, "edited");
  assert.equal(result.data.generated_content, "Content");
  assert.equal(result.data.edited_content, "Edited content");
});

test("buildReportSectionPatch returns error for no fields", () => {
  assert.equal(buildReportSectionPatch({}).error, "No fields to update");
});

// ── buildReportExportInsert ──────────────────────────────────────────────────

test("buildReportExportInsert validates format", () => {
  assert.equal(buildReportExportInsert({ format: "invalid" }, "p1", "u1").error, "Invalid export format");
});

test("buildReportExportInsert creates valid insert with defaults", () => {
  const result = buildReportExportInsert({ format: "docx" }, "p1", "u1");
  assert.equal(result.data.report_project_id, "p1");
  assert.equal(result.data.format, "docx");
  assert.equal(result.data.status, "pending");
  assert.equal(result.data.exported_by, null);
});

test("buildReportExportInsert sets exported_by when status is exported", () => {
  const result = buildReportExportInsert({ format: "pdf", status: "exported" }, "p1", "u1");
  assert.equal(result.data.exported_by, "u1");
});

// ── buildReportExportPatch ───────────────────────────────────────────────────

test("buildReportExportPatch patches export fields", () => {
  const result = buildReportExportPatch({
    status: "exported",
    fileUrl: "/download/e1.pdf",
    filePath: "exports/e1.pdf",
  });

  assert.equal(result.data.status, "exported");
  assert.equal(result.data.file_url, "/download/e1.pdf");
  assert.equal(result.data.file_path, "exports/e1.pdf");
});

test("buildReportExportPatch validates format", () => {
  assert.equal(buildReportExportPatch({ format: "invalid" }).error, "Invalid export format");
});

test("buildReportExportPatch returns error for no fields", () => {
  assert.equal(buildReportExportPatch({}).error, "No fields to update");
});

// ── buildReportJobInsert ─────────────────────────────────────────────────────

test("buildReportJobInsert validates job type", () => {
  assert.equal(buildReportJobInsert({ jobType: "invalid" }).error, "Invalid job type");
});

test("buildReportJobInsert creates valid insert with defaults", () => {
  const result = buildReportJobInsert({ reportProjectId: "p1", jobType: "generate_blueprint" });
  assert.equal(result.data.report_project_id, "p1");
  assert.equal(result.data.job_type, "generate_blueprint");
  assert.equal(result.data.status, "queued");
  assert.equal(result.data.progress_percent, 0);
  assert.equal(result.data.total_steps, 1);
});

// ── buildReportJobPatch ──────────────────────────────────────────────────────

test("buildReportJobPatch patches running status and progress", () => {
  const result = buildReportJobPatch({
    status: "running",
    progressPercent: 50,
    currentStep: "Processing",
    completedSteps: 2,
    totalSteps: 4,
  });

  assert.equal(result.data.status, "running");
  assert.equal(result.data.progress_percent, 50);
  assert.equal(result.data.current_step, "Processing");
  assert.equal(result.data.completed_steps, 2);
  assert.equal(result.data.total_steps, 4);
});

test("buildReportJobPatch rejects invalid status", () => {
  assert.equal(buildReportJobPatch({ status: "invalid" }).error, "Invalid job status");
});

test("buildReportJobPatch validates progressPercent range", () => {
  assert.equal(buildReportJobPatch({ progressPercent: -1 }).error, "progressPercent must be 0-100");
  assert.equal(buildReportJobPatch({ progressPercent: 101 }).error, "progressPercent must be 0-100");
  assert.equal(buildReportJobPatch({ progressPercent: 50 }).error, undefined);
});

test("buildReportJobPatch returns error for no fields", () => {
  assert.equal(buildReportJobPatch({}).error, "No fields to update");
});
