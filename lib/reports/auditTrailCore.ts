export type JsonObject = Record<string, unknown>;

export interface AuditProjectRow {
  id: string;
  name: string;
  source_type: "dashboard" | "canvas";
  source_dashboard_id?: string | null;
  source_canvas_id?: string | null;
  report_type: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditSnapshotRow {
  id: string;
  report_project_id: string;
  source_type: "dashboard" | "canvas";
  source_id: string;
  active_filters_snapshot: unknown;
  widgets_snapshot: unknown;
  worksheets_snapshot: unknown;
  insights_snapshot: unknown;
  query_outputs_snapshot: unknown;
  metadata: JsonObject;
  created_at: string;
}

export interface AuditBlueprintRow {
  id: string;
  report_project_id: string;
  version: number;
  status: string;
  title: string;
  objective?: string | null;
  audience?: string | null;
  blueprint_json: JsonObject;
  generated_by_ai: boolean;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditSectionRow {
  id: string;
  report_project_id: string;
  report_blueprint_id?: string | null;
  section_key: string;
  title: string;
  section_type: string;
  order_index: number;
  source_widget_ids: string[];
  source_worksheet_ids: string[];
  source_insight_ids: string[];
  status: string;
  generated_content?: string | null;
  edited_content?: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface AuditCompilationRow {
  id: string;
  report_project_id: string;
  report_blueprint_id?: string | null;
  source_snapshot_id?: string | null;
  title: string;
  compiled_payload: JsonObject;
  status: string;
  compiled_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditExportRow {
  id: string;
  report_project_id: string;
  report_blueprint_id?: string | null;
  format: string;
  file_url?: string | null;
  file_path?: string | null;
  export_config: JsonObject;
  status: string;
  exported_by?: string | null;
  exported_at?: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  report_project_id?: string | null;
  user_id: string;
  action_type: string;
  input_payload: JsonObject;
  output_summary: JsonObject;
  ai_model?: string | null;
  status: string;
  error_message?: string | null;
  created_at: string;
}

export interface ReportAuditTrail {
  project: JsonObject;
  source: JsonObject;
  snapshots: JsonObject[];
  blueprints: JsonObject[];
  sections: JsonObject[];
  compilations: JsonObject[];
  exports: JsonObject[];
  generation_logs: JsonObject[];
  traceability: JsonObject;
  warnings: string[];
}

export interface ReportVersionComparison {
  report_project_id: string;
  version_a: number;
  version_b: number;
  blueprint_a?: JsonObject;
  blueprint_b?: JsonObject;
  differences: JsonObject;
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asRecordArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

function generatedOutput(section: AuditSectionRow): JsonObject {
  return asRecord(section.metadata?.generated_output);
}

function queryOutputIds(snapshot: AuditSnapshotRow): string[] {
  return Object.keys(asRecord(snapshot.query_outputs_snapshot));
}

function snapshotWarnings(snapshot: AuditSnapshotRow): string[] {
  return asRecordArray(snapshot.metadata?.warnings)
    .map((warning) => String(warning.message ?? warning))
    .filter(Boolean);
}

function sectionWarnings(section: AuditSectionRow): string[] {
  const generatedWarnings = generatedOutput(section).warnings;
  return Array.isArray(generatedWarnings)
    ? generatedWarnings.map(String).filter(Boolean)
    : [];
}

export function buildReportAuditTrail(input: {
  project: AuditProjectRow;
  snapshots: AuditSnapshotRow[];
  blueprints: AuditBlueprintRow[];
  sections: AuditSectionRow[];
  compilations: AuditCompilationRow[];
  exports: AuditExportRow[];
  logs: AuditLogRow[];
}): ReportAuditTrail {
  const { project, snapshots, blueprints, sections, compilations, exports, logs } = input;
  const latestSnapshot = snapshots[0];
  const sourceMetadata = latestSnapshot ? asRecord(latestSnapshot.metadata?.source) : {};
  const allWarnings = [
    ...snapshots.flatMap(snapshotWarnings),
    ...sections.flatMap(sectionWarnings),
    ...sections
      .filter((section) => section.status === "failed")
      .map((section) => `Section "${section.title}" failed generation.`),
    ...logs
      .filter((log) => log.status === "failed")
      .map((log) => log.error_message || `${log.action_type} failed`),
  ].filter(Boolean);

  return {
    project: {
      id: project.id,
      name: project.name,
      report_type: project.report_type,
      status: project.status,
      created_by: project.created_by,
      created_at: project.created_at,
      updated_at: project.updated_at,
    },
    source: {
      source_type: project.source_type,
      source_dashboard_id: project.source_dashboard_id ?? null,
      source_canvas_id: project.source_canvas_id ?? null,
      latest_source_snapshot_id: latestSnapshot?.id ?? null,
      latest_source_snapshot_captured_at: latestSnapshot?.created_at ?? null,
      title: sourceMetadata.title ?? null,
      active_filters: latestSnapshot?.active_filters_snapshot ?? {},
    },
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      source_type: snapshot.source_type,
      source_id: snapshot.source_id,
      captured_at: snapshot.created_at,
      active_filters: snapshot.active_filters_snapshot,
      widget_ids: asRecordArray(snapshot.widgets_snapshot).map((widget) => widget.id).filter(Boolean),
      worksheet_ids: asRecordArray(snapshot.worksheets_snapshot).map((worksheet) => worksheet.id).filter(Boolean),
      insight_ids: asRecordArray(snapshot.insights_snapshot).map((insight) => insight.id).filter(Boolean),
      query_output_ids: queryOutputIds(snapshot),
      warnings: snapshotWarnings(snapshot),
      metadata: snapshot.metadata,
    })),
    blueprints: blueprints.map((blueprint) => ({
      id: blueprint.id,
      version: blueprint.version,
      status: blueprint.status,
      title: blueprint.title,
      generated_by_ai: blueprint.generated_by_ai,
      approved_by: blueprint.approved_by ?? null,
      approved_at: blueprint.approved_at ?? null,
      previous_blueprint_id: blueprint.blueprint_json?.previous_blueprint_id ?? null,
      created_at: blueprint.created_at,
      updated_at: blueprint.updated_at,
    })),
    sections: sections.map((section) => ({
      id: section.id,
      report_blueprint_id: section.report_blueprint_id ?? null,
      section_key: section.section_key,
      title: section.title,
      section_type: section.section_type,
      order_index: section.order_index,
      status: section.status,
      source_widget_ids: section.source_widget_ids,
      source_worksheet_ids: section.source_worksheet_ids,
      source_insight_ids: section.source_insight_ids,
      generated_at: generatedOutput(section).generated_at ?? null,
      ai_model: generatedOutput(section).model ?? null,
      source_snapshot_id: generatedOutput(section).source_snapshot_id ?? null,
      warnings: sectionWarnings(section),
      created_at: section.created_at,
      updated_at: section.updated_at,
    })),
    compilations: compilations.map((compilation) => ({
      id: compilation.id,
      report_blueprint_id: compilation.report_blueprint_id ?? null,
      source_snapshot_id: compilation.source_snapshot_id ?? null,
      status: compilation.status,
      compiled_by: compilation.compiled_by ?? null,
      created_at: compilation.created_at,
      updated_at: compilation.updated_at,
      payload_metadata: asRecord(compilation.compiled_payload?.metadata),
      audit_note: asRecord(compilation.compiled_payload?.audit_note),
    })),
    exports: exports.map((exportRow) => ({
      id: exportRow.id,
      report_blueprint_id: exportRow.report_blueprint_id ?? null,
      source_snapshot_id: exportRow.export_config?.source_snapshot_id ?? null,
      compilation_id: exportRow.export_config?.compilation_id ?? null,
      format: exportRow.format,
      status: exportRow.status,
      file_url: exportRow.file_url ?? null,
      file_path: exportRow.file_path ?? null,
      exported_by: exportRow.exported_by ?? null,
      exported_at: exportRow.exported_at ?? null,
      created_at: exportRow.created_at,
    })),
    generation_logs: logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      action_type: log.action_type,
      status: log.status,
      ai_model: log.ai_model ?? null,
      input_payload: log.input_payload,
      output_summary: log.output_summary,
      error_message: log.error_message ?? null,
      created_at: log.created_at,
    })),
    traceability: {
      source_snapshot_ids: snapshots.map((snapshot) => snapshot.id),
      blueprint_versions: blueprints.map((blueprint) => blueprint.version),
      widget_ids_used: uniqueStrings(sections.flatMap((section) => section.source_widget_ids)),
      worksheet_ids_used: uniqueStrings(sections.flatMap((section) => section.source_worksheet_ids)),
      insight_ids_used: uniqueStrings(sections.flatMap((section) => section.source_insight_ids)),
      query_output_ids_used: uniqueStrings(snapshots.flatMap(queryOutputIds)),
      ai_models_used: uniqueStrings([
        ...sections.map((section) => generatedOutput(section).model),
        ...logs.map((log) => log.ai_model),
      ]),
      action_count: logs.length,
      failed_action_count: logs.filter((log) => log.status === "failed").length,
      export_count: exports.length,
    },
    warnings: allWarnings,
  };
}

function sectionsForVersion(sections: AuditSectionRow[], blueprintId?: string): AuditSectionRow[] {
  if (!blueprintId) return [];
  return sections
    .filter((section) => section.report_blueprint_id === blueprintId)
    .sort((a, b) => a.order_index - b.order_index);
}

export function compareReportVersionsFromRows(input: {
  reportProjectId: string;
  versionA: number;
  versionB: number;
  blueprints: AuditBlueprintRow[];
  sections: AuditSectionRow[];
  compilations: AuditCompilationRow[];
}): ReportVersionComparison {
  const blueprintA = input.blueprints.find((blueprint) => blueprint.version === input.versionA);
  const blueprintB = input.blueprints.find((blueprint) => blueprint.version === input.versionB);
  const sectionsA = sectionsForVersion(input.sections, blueprintA?.id);
  const sectionsB = sectionsForVersion(input.sections, blueprintB?.id);
  const sectionKeysA = sectionsA.map((section) => section.section_key);
  const sectionKeysB = sectionsB.map((section) => section.section_key);

  return {
    report_project_id: input.reportProjectId,
    version_a: input.versionA,
    version_b: input.versionB,
    blueprint_a: blueprintA ? {
      id: blueprintA.id,
      title: blueprintA.title,
      status: blueprintA.status,
      created_at: blueprintA.created_at,
    } : undefined,
    blueprint_b: blueprintB ? {
      id: blueprintB.id,
      title: blueprintB.title,
      status: blueprintB.status,
      created_at: blueprintB.created_at,
    } : undefined,
    differences: {
      title_changed: blueprintA?.title !== blueprintB?.title,
      status_changed: blueprintA?.status !== blueprintB?.status,
      section_count_delta: sectionsB.length - sectionsA.length,
      added_section_keys: sectionKeysB.filter((key) => !sectionKeysA.includes(key)),
      removed_section_keys: sectionKeysA.filter((key) => !sectionKeysB.includes(key)),
      changed_section_titles: sectionsB
        .filter((sectionB) => {
          const sectionA = sectionsA.find((section) => section.section_key === sectionB.section_key);
          return sectionA && sectionA.title !== sectionB.title;
        })
        .map((section) => section.section_key),
      compilation_ids_a: input.compilations
        .filter((compilation) => compilation.report_blueprint_id === blueprintA?.id)
        .map((compilation) => compilation.id),
      compilation_ids_b: input.compilations
        .filter((compilation) => compilation.report_blueprint_id === blueprintB?.id)
        .map((compilation) => compilation.id),
    },
  };
}
