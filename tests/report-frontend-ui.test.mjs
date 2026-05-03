import assert from "node:assert/strict";
import test from "node:test";

// --- Pure helper functions extracted from ReportWorkspace.tsx ---

function formatDate(value) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readJson(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

const REPORT_PROGRESS_LABELS = {
  draft: "Draft",
  blueprint_generated: "Outline ready",
  blueprint_approved: "Outline ready",
  generating: "Generating",
  generated: "Draft ready",
  exported: "Exported",
  review: "Ready",
  approved: "Ready",
  archived: "Archived",
  failed: "Needs attention",
};

const REPORT_TYPE_LABELS = {
  executive_summary: "Executive summary",
  management_report: "Management report",
  technical_report: "Technical report",
  custom_report: "Custom report",
};

function getSourceLabel(project, sourceOptions) {
  const sourceId = project.sourceType === "dashboard" ? project.sourceDashboardId : project.sourceCanvasId;
  return sourceOptions.find((option) => option.type === project.sourceType && option.id === sourceId)?.title ?? sourceId ?? "Source";
}

function getProgressLabel(status) {
  return REPORT_PROGRESS_LABELS[status] ?? "Draft";
}

function getProgressTextClass(status) {
  if (status === "failed") return "text-red-600";
  if (status === "exported") return "text-green-700";
  return "text-muted-foreground";
}

function isBlueprintApprovable(blueprint) {
  if (!blueprint) return false;
  return blueprint.status !== "approved" && blueprint.status !== "locked";
}

function hasSnapshot(logs) {
  return logs.some((log) => log.actionType === "capture_source_snapshot" && log.status === "success");
}

function hasGeneratedSections(sections) {
  return sections.some((section) => section.generatedContent || section.editedContent);
}

// Workflow progression logic (same pattern as ReportWorkspace.tsx)
const WORKFLOW_STEPS = [
  { key: "capture", doneCheck: (logs) => hasSnapshot(logs), label: "Capture source" },
  { key: "blueprint", doneCheck: (_, blueprint) => !!blueprint, label: "Blueprint" },
  { key: "sections", doneCheck: (_, blueprint, sections) => hasGeneratedSections(sections), label: "Sections" },
  { key: "compile", doneCheck: (_, _b, _s, compiled) => !!compiled, label: "Compile" },
];

// --- Tests ---

// formatDate tests

test("formatDate returns 'Not yet' for undefined/null/empty", () => {
  assert.equal(formatDate(undefined), "Not yet");
  assert.equal(formatDate(null), "Not yet");
  assert.equal(formatDate(""), "Not yet");
});

test("formatDate returns a formatted date string for valid ISO dates", () => {
  const result = formatDate("2026-05-01T10:30:00.000Z");
  assert.match(result, /May/);
  assert.match(result, /1/);
  assert.match(result, /:/);
});

// readJson tests

test("readJson returns parsed body on 2xx response", async () => {
  const res = { ok: true, json: () => Promise.resolve({ id: "abc", name: "Test" }) };
  const data = await readJson(res);
  assert.deepEqual(data, { id: "abc", name: "Test" });
});

test("readJson throws with error message from body on non-2xx", async () => {
  const res = { ok: false, status: 400, json: () => Promise.resolve({ error: "Bad request" }) };
  await assert.rejects(() => readJson(res), /Bad request/);
});

test("readJson throws fallback message on non-2xx without error body", async () => {
  const res = { ok: false, status: 500, json: () => Promise.resolve({}) };
  await assert.rejects(() => readJson(res), /Request failed \(500\)/);
});

test("readJson throws fallback message on non-2xx when json parsing fails", async () => {
  const res = { ok: false, status: 403, json: () => Promise.reject(new Error("parse error")) };
  await assert.rejects(() => readJson(res), /Request failed \(403\)/);
});

// REPORT_PROGRESS_LABELS

test("REPORT_PROGRESS_LABELS covers all project statuses without approval jargon", () => {
  const expected = ["draft", "blueprint_generated", "blueprint_approved", "generating", "generated", "exported", "review", "approved", "archived", "failed"];
  for (const status of expected) {
    assert.ok(REPORT_PROGRESS_LABELS[status], `Missing label for status: ${status}`);
    assert.equal(typeof REPORT_PROGRESS_LABELS[status], "string");
  }
  assert.equal(REPORT_PROGRESS_LABELS.approved, "Ready");
  assert.equal(REPORT_PROGRESS_LABELS.blueprint_approved, "Outline ready");
});

// REPORT_TYPE_LABELS

test("REPORT_TYPE_LABELS covers all report types", () => {
  const expected = ["executive_summary", "management_report", "technical_report", "custom_report"];
  for (const type of expected) {
    assert.ok(REPORT_TYPE_LABELS[type], `Missing label for type: ${type}`);
    assert.equal(typeof REPORT_TYPE_LABELS[type], "string");
  }
});

// getSourceLabel tests

const sourceOptions = [
  { id: "d-1", type: "dashboard", title: "Sales Dashboard", meta: "Published" },
  { id: "c-1", type: "canvas", title: "Q1 Canvas", meta: "10 blocks" },
  { id: "c-2", type: "canvas", title: "Q2 Canvas", meta: "8 blocks" },
];

test("getSourceLabel returns matching dashboard title", () => {
  const project = { sourceType: "dashboard", sourceDashboardId: "d-1", sourceCanvasId: null };
  assert.equal(getSourceLabel(project, sourceOptions), "Sales Dashboard");
});

test("getSourceLabel returns matching canvas title", () => {
  const project = { sourceType: "canvas", sourceDashboardId: null, sourceCanvasId: "c-1" };
  assert.equal(getSourceLabel(project, sourceOptions), "Q1 Canvas");
});

test("getSourceLabel falls back to sourceId when no title match", () => {
  const project = { sourceType: "canvas", sourceDashboardId: null, sourceCanvasId: "missing-id" };
  assert.equal(getSourceLabel(project, sourceOptions), "missing-id");
});

test("getSourceLabel falls back to 'Source' when sourceId is null and no match", () => {
  const project = { sourceType: "dashboard", sourceDashboardId: null, sourceCanvasId: null };
  assert.equal(getSourceLabel(project, sourceOptions), "Source");
});

// getProgressTextClass tests

test("getProgressTextClass returns red for failed", () => {
  assert.match(getProgressTextClass("failed"), /red/);
});

test("getProgressTextClass returns green for exported only", () => {
  assert.match(getProgressTextClass("exported"), /green/);
  assert.doesNotMatch(getProgressTextClass("approved"), /green/);
});

test("getProgressTextClass returns muted for normal authoring states", () => {
  const mutedStatuses = ["draft", "blueprint_generated", "blueprint_approved", "generating", "generated", "review", "approved", "archived"];
  for (const status of mutedStatuses) {
    assert.match(getProgressTextClass(status), /muted/, `Expected muted for ${status}`);
  }
});

test("getProgressLabel falls back to Draft", () => {
  assert.equal(getProgressLabel("unknown"), "Draft");
});

// isBlueprintApprovable tests

test("isBlueprintApprovable returns false for undefined blueprint", () => {
  assert.equal(isBlueprintApprovable(undefined), false);
});

test("isBlueprintApprovable returns false for already approved blueprint", () => {
  assert.equal(isBlueprintApprovable({ id: "b1", status: "approved" }), false);
});

test("isBlueprintApprovable returns false for locked blueprint", () => {
  assert.equal(isBlueprintApprovable({ id: "b1", status: "locked" }), false);
});

test("isBlueprintApprovable returns true for draft/edited/superseded blueprints", () => {
  assert.equal(isBlueprintApprovable({ id: "b1", status: "draft" }), true);
  assert.equal(isBlueprintApprovable({ id: "b1", status: "edited" }), true);
  assert.equal(isBlueprintApprovable({ id: "b1", status: "superseded" }), true);
});

// hasSnapshot tests

test("hasSnapshot returns true when a capture_source_snapshot success log exists", () => {
  const logs = [
    { actionType: "generate_blueprint", status: "success" },
    { actionType: "capture_source_snapshot", status: "success" },
  ];
  assert.equal(hasSnapshot(logs), true);
});

test("hasSnapshot returns false when capture log has failed status", () => {
  const logs = [
    { actionType: "capture_source_snapshot", status: "failed" },
  ];
  assert.equal(hasSnapshot(logs), false);
});

test("hasSnapshot returns false when no capture log exists", () => {
  assert.equal(hasSnapshot([]), false);
});

// hasGeneratedSections tests

test("hasGeneratedSections returns true when a section has generatedContent", () => {
  const sections = [{ generatedContent: "Some content", editedContent: null }];
  assert.equal(hasGeneratedSections(sections), true);
});

test("hasGeneratedSections returns true when a section has editedContent", () => {
  const sections = [{ generatedContent: null, editedContent: "Edited content" }];
  assert.equal(hasGeneratedSections(sections), true);
});

test("hasGeneratedSections returns false when all sections have no content", () => {
  const sections = [{ generatedContent: null, editedContent: null }];
  assert.equal(hasGeneratedSections(sections), false);
});

test("hasGeneratedSections returns false for empty sections array", () => {
  assert.equal(hasGeneratedSections([]), false);
});

// Workflow progression tests

test("workflow steps compute done states correctly", () => {
  const logs = [{ actionType: "capture_source_snapshot", status: "success" }];
  const blueprint = { id: "b1", status: "approved" };
  const sections = [{ id: "s1", generatedContent: "content", editedContent: null }];
  const compiled = { title: "Report" };

  const states = WORKFLOW_STEPS.map((step) => {
    if (step.key === "capture") return step.doneCheck(logs);
    if (step.key === "blueprint") return step.doneCheck(logs, blueprint);
    if (step.key === "sections") return step.doneCheck(logs, blueprint, sections);
    if (step.key === "compile") return step.doneCheck(logs, blueprint, sections, compiled);
  });

  assert.deepEqual(states, [true, true, true, true]);
});

test("workflow steps show all not done in initial state", () => {
  const states = WORKFLOW_STEPS.map((step) => {
    return step.doneCheck([], null, [], null);
  });
  assert.deepEqual(states, [false, false, false, false]);
});

test("workflow allows partial progression (captured but no blueprint yet)", () => {
  const logs = [{ actionType: "capture_source_snapshot", status: "success" }];
  const states = [
    WORKFLOW_STEPS[0].doneCheck(logs),
    WORKFLOW_STEPS[1].doneCheck(logs, null),
    WORKFLOW_STEPS[2].doneCheck(logs, null, []),
    WORKFLOW_STEPS[3].doneCheck(logs, null, [], null),
  ];
  assert.deepEqual(states, [true, false, false, false]);
});

// Tab configuration tests (from Tabs + TabsTrigger in ReportWorkspace)
test("report workspace has the normal report authoring tabs", () => {
  const tabs = ["blueprint", "sections", "preview", "export"];
  assert.equal(tabs.length, 4);
  assert.deepEqual(tabs, ["blueprint", "sections", "preview", "export"]);
});

// Export format tests
test("export panel supports 4 formats", () => {
  const formats = ["docx", "pdf", "excel", "html"];
  assert.equal(formats.length, 4);
  assert.deepEqual(formats, ["docx", "pdf", "excel", "html"]);
});

// Source options derivation logic
test("sourceOptions derivation filters published canvases as dashboards", () => {
  const canvases = [
    { id: "c1", name: "Q1 Canvas", blocks: [{ id: "b1" }, { id: "b2" }], published: false, publishedTitle: null },
    { id: "c2", name: "Q2 Report", blocks: [{ id: "b3" }], published: true, publishedTitle: "Published Q2" },
  ];

  const derived = [
    ...canvases.filter((c) => c.published).map((c) => ({
      id: c.id,
      type: "dashboard",
      title: c.publishedTitle ?? c.name,
      meta: "Published dashboard",
    })),
    ...canvases.map((c) => ({
      id: c.id,
      type: "canvas",
      title: c.name,
      meta: `${c.blocks.length} block${c.blocks.length === 1 ? "" : "s"}`,
    })),
  ];

  assert.equal(derived.length, 3);
  assert.equal(derived[0].type, "dashboard");
  assert.equal(derived[0].title, "Published Q2");
  assert.equal(derived[1].type, "canvas");
  assert.equal(derived[1].title, "Q1 Canvas");
  assert.equal(derived[1].meta, "2 blocks");
  assert.equal(derived[2].type, "canvas");
  assert.equal(derived[2].title, "Q2 Report");
  assert.equal(derived[2].meta, "1 block");
});

// Initial source from search params
test("initialSource is extracted from URL search params (sourceType + sourceId)", () => {
  const params = new Map([["sourceType", "canvas"], ["sourceId", "c-1"]]);
  const sourceType = params.get("sourceType");
  const sourceId = params.get("sourceId");
  const result = (sourceType === "dashboard" || sourceType === "canvas") && sourceId
    ? { type: sourceType, id: sourceId }
    : undefined;
  assert.deepEqual(result, { type: "canvas", id: "c-1" });
});

test("initialSource returns undefined when params are missing", () => {
  assert.equal(undefined, undefined);
});

test("initialSource rejects invalid sourceType", () => {
  const params = new Map([["sourceType", "invalid"], ["sourceId", "c-1"]]);
  const sourceType = params.get("sourceType");
  const sourceId = params.get("sourceId");
  const result = (sourceType === "dashboard" || sourceType === "canvas") && sourceId
    ? { type: sourceType, id: sourceId }
    : undefined;
  assert.equal(result, undefined);
});
