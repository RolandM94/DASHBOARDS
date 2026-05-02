export type JsonObject = Record<string, unknown>;

export interface ReportCompilerProjectRow {
  id: string;
  name: string;
  description?: string | null;
  source_type: "dashboard" | "canvas";
  source_dashboard_id?: string | null;
  source_canvas_id?: string | null;
  report_type: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReportCompilerBlueprintRow {
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

export interface ReportCompilerSectionRow {
  id: string;
  report_project_id: string;
  report_blueprint_id?: string | null;
  parent_section_id?: string | null;
  section_key: string;
  title: string;
  section_type: string;
  order_index: number;
  source_widget_ids: string[];
  source_worksheet_ids: string[];
  source_insight_ids: string[];
  section_prompt?: string | null;
  section_config: JsonObject;
  status: string;
  generated_content?: string | null;
  edited_content?: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface ReportCompilerSnapshotRow {
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

export interface CompileReportOptions {
  includeAppendices?: boolean;
  allowPreview?: boolean;
}

export interface CompiledReportSection {
  id: string;
  section_key: string;
  title: string;
  section_type: string;
  content_markdown: string;
  order_index: number;
  source_references: Array<{
    widget_id?: string;
    worksheet_id?: string;
    insight_id?: string;
  }>;
  warnings: string[];
  status: string;
  embedded_figures: Array<{
    figure_number: number;
    widget_id: string;
    title: string;
    widget_type: string;
    visual_config: JsonObject;
    query_output: JsonObject;
  }>;
}

export interface CompiledReportPayload {
  title: string;
  metadata: JsonObject;
  cover_page: JsonObject;
  table_of_contents: Array<{
    title: string;
    section_key: string;
    order_index: number;
  }>;
  objective?: string | null;
  audience?: string | null;
  scope: JsonObject;
  methodology_note: string;
  source_note: string;
  sections: CompiledReportSection[];
  charts: JsonObject[];
  appendices: JsonObject[];
  audit_note: JsonObject;
  warnings: string[];
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asRecordArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function generatedOutput(section: ReportCompilerSectionRow): JsonObject {
  return asRecord(section.metadata?.generated_output);
}

function sourceReferences(section: ReportCompilerSectionRow): CompiledReportSection["source_references"] {
  return asRecordArray(generatedOutput(section).source_references).map((reference) => ({
    widget_id: typeof reference.widget_id === "string" ? reference.widget_id : undefined,
    worksheet_id: typeof reference.worksheet_id === "string" ? reference.worksheet_id : undefined,
    insight_id: typeof reference.insight_id === "string" ? reference.insight_id : undefined,
  }));
}

function chartPlaceholders(snapshot: ReportCompilerSnapshotRow): JsonObject[] {
  const widgets = asRecordArray(snapshot.widgets_snapshot);
  const queryOutputs = asRecord(snapshot.query_outputs_snapshot);

  return widgets.map((widget) => ({
    widget_id: String(widget.id ?? ""),
    title: String(widget.title ?? "Untitled widget"),
    widget_type: String(widget.type ?? "unknown"),
    worksheet_id: widget.worksheet_id ? String(widget.worksheet_id) : undefined,
    chart_image_url: typeof widget.chart_image_url === "string" ? widget.chart_image_url : null,
    chart_image_placeholder: typeof widget.chart_image_url !== "string",
    source_data_table: queryOutputs[String(widget.id ?? "")] ?? widget.query_output ?? null,
    visual_config: asRecord(widget.visual_config),
  }));
}

function transformChartData(widgets: JsonObject[], queryOutputs: JsonObject): Map<string, { title: string; widget_type: string; visual_config: JsonObject; query_output: JsonObject; worksheet_id?: string }> {
  const map = new Map<string, { title: string; widget_type: string; visual_config: JsonObject; query_output: JsonObject; worksheet_id?: string }>();
  for (const widget of widgets) {
    const id = String(widget.id ?? "");
    if (!id) continue;
    map.set(id, {
      title: String(widget.title ?? "Untitled widget"),
      widget_type: String(widget.type ?? "unknown"),
      visual_config: asRecord(widget.visual_config),
      query_output: asRecord(queryOutputs[id] ?? widget.query_output ?? {}),
      worksheet_id: widget.worksheet_id ? String(widget.worksheet_id) : undefined,
    });
  }
  return map;
}

function buildAppendices(snapshot: ReportCompilerSnapshotRow, sections: ReportCompilerSectionRow[], includeAppendices: boolean): JsonObject[] {
  if (!includeAppendices) return [];

  return [
    {
      title: "Source Filters",
      type: "source_filters",
      content: snapshot.active_filters_snapshot ?? {},
    },
    {
      title: "Widget Data Tables",
      type: "widget_data_tables",
      content: chartPlaceholders(snapshot),
    },
    {
      title: "Worksheet Configurations",
      type: "worksheet_configurations",
      content: asRecordArray(snapshot.worksheets_snapshot),
    },
    {
      title: "Data Quality Warnings",
      type: "data_quality_warnings",
      content: asRecordArray(snapshot.metadata?.warnings),
    },
    {
      title: "Section Generation Notes",
      type: "section_generation_notes",
      content: sections.map((section) => ({
        section_id: section.id,
        title: section.title,
        status: section.status,
        warnings: stringArray(generatedOutput(section).warnings),
        generated_at: generatedOutput(section).generated_at ?? null,
        model: generatedOutput(section).model ?? null,
      })),
    },
  ];
}

export function buildCompiledReportPayload(
  project: ReportCompilerProjectRow,
  blueprint: ReportCompilerBlueprintRow,
  sections: ReportCompilerSectionRow[],
  snapshot: ReportCompilerSnapshotRow,
  options: CompileReportOptions = {}
): CompiledReportPayload {
  const orderedSections = [...sections].sort((a, b) => a.order_index - b.order_index);
  const warnings: string[] = [];
  const source = asRecord(snapshot.metadata?.source);
  const allWidgets = asRecordArray(snapshot.widgets_snapshot);
  const queryOutputs = asRecord(snapshot.query_outputs_snapshot);
  const chartData = transformChartData(allWidgets, queryOutputs);
  const auditNoteText = `This report was generated from ${String(source.title ?? `${snapshot.source_type} ${snapshot.source_id}`)} using data captured on ${snapshot.created_at}. The report was generated using dashboard filters: ${JSON.stringify(snapshot.active_filters_snapshot ?? {})}. All figures are based on system-calculated worksheet outputs. AI-generated narrative was produced from the captured dashboard data.`;

  // Assign sequential figure numbers across all sections
  let figureCounter = 0;
  const compiledSections = orderedSections.map((section) => {
    const content = (section.edited_content || section.generated_content || "").trim();
    if (!content) warnings.push(`Section "${section.title}" has no generated or edited content.`);

    // Collect figures for this section's widgets
    const embeddedFigures = section.source_widget_ids
      .map((widgetId) => {
        const data = chartData.get(widgetId);
        if (!data) return null;
        figureCounter += 1;
        return {
          figure_number: figureCounter,
          widget_id: widgetId,
          title: data.title,
          widget_type: data.widget_type,
          visual_config: data.visual_config,
          query_output: data.query_output,
        };
      })
      .filter((fig): fig is NonNullable<typeof fig> => fig !== null);

    return {
      id: section.id,
      section_key: section.section_key,
      title: section.title,
      section_type: section.section_type,
      content_markdown: content,
      order_index: section.order_index,
      source_references: sourceReferences(section),
      warnings: stringArray(generatedOutput(section).warnings),
      status: section.status,
      embedded_figures: embeddedFigures,
    };
  });

  // Flatten all figures for the legacy charts array
  const allCharts = compiledSections.flatMap((section) =>
    section.embedded_figures.map((fig) => ({
      widget_id: fig.widget_id,
      title: fig.title,
      widget_type: fig.widget_type,
      chart_image_url: null as string | null,
      chart_image_placeholder: true,
      source_data_table: fig.query_output,
      visual_config: fig.visual_config,
    }))
  );

  return {
    title: blueprint.title || project.name,
    metadata: {
      report_project_id: project.id,
      report_blueprint_id: blueprint.id,
      source_snapshot_id: snapshot.id,
      report_type: project.report_type,
      compiled_at: new Date().toISOString(),
      blueprint_version: blueprint.version,
      section_count: compiledSections.length,
      chart_count: allCharts.length,
    },
    cover_page: {
      title: blueprint.title || project.name,
      description: project.description,
      report_type: project.report_type,
      source_type: project.source_type,
      source_title: source.title,
      generated_at: new Date().toISOString(),
    },
    table_of_contents: compiledSections.map((section) => ({
      title: section.title,
      section_key: section.section_key,
      order_index: section.order_index,
    })),
    objective: blueprint.objective,
    audience: blueprint.audience,
    scope: {
      source_type: snapshot.source_type,
      source_id: snapshot.source_id,
      source,
      active_filters: snapshot.active_filters_snapshot,
      captured_at: snapshot.created_at,
    },
    methodology_note: "This report was compiled from generated report sections backed by the captured dashboard or canvas source snapshot. Values should trace to captured widget query outputs and worksheet configurations.",
    source_note: `Source snapshot ${snapshot.id} was captured from ${snapshot.source_type} ${snapshot.source_id}.`,
    sections: compiledSections,
    charts: allCharts,
    appendices: buildAppendices(snapshot, orderedSections, options.includeAppendices ?? true),
    audit_note: {
      note_text: auditNoteText,
      source_dashboard_id: project.source_dashboard_id ?? null,
      source_canvas_id: project.source_canvas_id ?? null,
      source_snapshot_id: snapshot.id,
      filters_applied: snapshot.active_filters_snapshot ?? {},
      blueprint_status: blueprint.status,
      section_statuses: orderedSections.map((section) => ({
        section_id: section.id,
        status: section.status,
      })),
    },
    warnings,
  };
}
