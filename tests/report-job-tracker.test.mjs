import assert from "node:assert/strict";
import test from "node:test";

// ── Pure helper functions from jobTracker.ts (inline for Node 16 compatibility) ──

function canCancelJob(status) {
  return status === "queued" || status === "running";
}

function canRetryJob(status) {
  return status === "failed" || status === "cancelled";
}

function computeProgressPercent(completed, total) {
  if (total <= 0) return 0;
  return Math.round((Math.min(completed, total) / total) * 100);
}

function jobLabel(jobType) {
  const labels = {
    capture_source_snapshot: "Capturing dashboard data",
    generate_blueprint: "Generating blueprint",
    generate_section: "Generating section",
    generate_all_sections: "Generating sections",
    compile_report: "Compiling report",
    export_report: "Exporting report",
  };
  return labels[jobType] ?? jobType.replaceAll("_", " ");
}

function dbToReportJob(row) {
  return {
    id: String(row.id),
    reportProjectId: String(row.report_project_id),
    jobType: row.job_type,
    status: row.status,
    progressPercent: Number(row.progress_percent),
    currentStep: String(row.current_step),
    totalSteps: Number(row.total_steps),
    completedSteps: Number(row.completed_steps),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    startedAt: row.started_at ? String(row.started_at) : undefined,
    finishedAt: row.finished_at ? String(row.finished_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function buildReportJobInsert(body) {
  const JOB_TYPES = ["capture_source_snapshot", "generate_blueprint", "generate_section", "generate_all_sections", "compile_report", "export_report"];
  if (!JOB_TYPES.includes(body.jobType)) return { error: "Invalid job type" };
  return {
    data: {
      report_project_id: body.reportProjectId ?? null,
      job_type: body.jobType,
      status: "queued",
      progress_percent: 0,
      current_step: body.currentStep ?? "Queued",
      total_steps: typeof body.totalSteps === "number" && body.totalSteps > 0 ? body.totalSteps : 1,
      completed_steps: 0,
      error_message: null,
      started_at: body.startedAt === null ? null : (body.startedAt ?? null),
      finished_at: null,
    },
  };
}

function buildReportJobPatch(body) {
  const JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled"];
  const patch = {};
  if (body.status !== undefined) {
    if (!JOB_STATUSES.includes(body.status)) return { error: "Invalid job status" };
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
  if (body.errorMessage !== undefined) patch.error_message = body.errorMessage ?? null;
  if (body.finishedAt !== undefined) patch.finished_at = body.finishedAt ?? null;
  return Object.keys(patch).length === 0 ? { error: "No fields to update" } : { data: patch };
}

// ── Tests ──

test("canCancelJob returns true for queued and running", () => {
  assert.equal(canCancelJob("queued"), true);
  assert.equal(canCancelJob("running"), true);
});

test("canCancelJob returns false for completed, failed, cancelled", () => {
  assert.equal(canCancelJob("completed"), false);
  assert.equal(canCancelJob("failed"), false);
  assert.equal(canCancelJob("cancelled"), false);
});

test("canRetryJob returns true for failed and cancelled", () => {
  assert.equal(canRetryJob("failed"), true);
  assert.equal(canRetryJob("cancelled"), true);
});

test("canRetryJob returns false for queued, running, completed", () => {
  assert.equal(canRetryJob("queued"), false);
  assert.equal(canRetryJob("running"), false);
  assert.equal(canRetryJob("completed"), false);
});

test("computeProgressPercent returns 0 when total is 0", () => {
  assert.equal(computeProgressPercent(5, 0), 0);
});

test("computeProgressPercent returns 0 for 0 completed", () => {
  assert.equal(computeProgressPercent(0, 10), 0);
});

test("computeProgressPercent returns correct percentages", () => {
  assert.equal(computeProgressPercent(1, 4), 25);
  assert.equal(computeProgressPercent(2, 4), 50);
  assert.equal(computeProgressPercent(3, 4), 75);
  assert.equal(computeProgressPercent(4, 4), 100);
});

test("computeProgressPercent caps at 100 when completed exceeds total", () => {
  assert.equal(computeProgressPercent(10, 5), 100);
});

test("computeProgressPercent rounds correctly", () => {
  assert.equal(computeProgressPercent(1, 3), 33);
  assert.equal(computeProgressPercent(2, 3), 67);
});

test("jobLabel returns human-readable labels for all job types", () => {
  assert.equal(jobLabel("capture_source_snapshot"), "Capturing dashboard data");
  assert.equal(jobLabel("generate_blueprint"), "Generating blueprint");
  assert.equal(jobLabel("generate_section"), "Generating section");
  assert.equal(jobLabel("generate_all_sections"), "Generating sections");
  assert.equal(jobLabel("compile_report"), "Compiling report");
  assert.equal(jobLabel("export_report"), "Exporting report");
});

test("jobLabel falls back to underscore replacement for unknown types", () => {
  assert.equal(jobLabel("unknown_task"), "unknown task");
});

test("dbToReportJob maps a database row to camelCase ReportJob", () => {
  const row = {
    id: "job-uuid-1",
    report_project_id: "project-uuid-1",
    job_type: "generate_blueprint",
    status: "running",
    progress_percent: 60,
    current_step: "Generating section 3 of 5",
    total_steps: 5,
    completed_steps: 3,
    error_message: null,
    started_at: "2026-05-02T08:00:00.000Z",
    finished_at: null,
    created_at: "2026-05-02T08:00:00.000Z",
    updated_at: "2026-05-02T08:02:00.000Z",
  };

  const job = dbToReportJob(row);
  assert.equal(job.id, "job-uuid-1");
  assert.equal(job.reportProjectId, "project-uuid-1");
  assert.equal(job.jobType, "generate_blueprint");
  assert.equal(job.status, "running");
  assert.equal(job.progressPercent, 60);
  assert.equal(job.currentStep, "Generating section 3 of 5");
  assert.equal(job.totalSteps, 5);
  assert.equal(job.completedSteps, 3);
  assert.equal(job.errorMessage, undefined);
  assert.equal(job.startedAt, "2026-05-02T08:00:00.000Z");
  assert.equal(job.finishedAt, undefined);
});

test("dbToReportJob includes errorMessage when present", () => {
  const job = dbToReportJob({
    id: "j1", report_project_id: "p1", job_type: "export_report",
    status: "failed", progress_percent: 0, current_step: "",
    total_steps: 1, completed_steps: 0,
    error_message: "API key not configured",
    started_at: null, finished_at: "2026-05-02T09:00:00.000Z",
    created_at: "2026-05-02T09:00:00.000Z", updated_at: "2026-05-02T09:00:00.000Z",
  });
  assert.equal(job.errorMessage, "API key not configured");
  assert.equal(job.finishedAt, "2026-05-02T09:00:00.000Z");
});

test("buildReportJobInsert creates a queued job with correct defaults", () => {
  const result = buildReportJobInsert({ reportProjectId: "p1", jobType: "compile_report" });
  assert.equal(result.error, undefined);
  assert.equal(result.data.status, "queued");
  assert.equal(result.data.job_type, "compile_report");
  assert.equal(result.data.progress_percent, 0);
  assert.equal(result.data.total_steps, 1);
});

test("buildReportJobInsert rejects invalid job type", () => {
  const result = buildReportJobInsert({ jobType: "invalid_job" });
  assert.equal(result.error, "Invalid job type");
});

test("buildReportJobPatch updates status, progress, and step info", () => {
  const result = buildReportJobPatch({ status: "running", progressPercent: 50, currentStep: "Processing", completedSteps: 2, totalSteps: 4 });
  assert.equal(result.data.status, "running");
  assert.equal(result.data.progress_percent, 50);
  assert.equal(result.data.completed_steps, 2);
});

test("buildReportJobPatch rejects invalid status", () => {
  assert.equal(buildReportJobPatch({ status: "invalid" }).error, "Invalid job status");
});

test("buildReportJobPatch returns error when no fields to update", () => {
  assert.equal(buildReportJobPatch({}).error, "No fields to update");
});
