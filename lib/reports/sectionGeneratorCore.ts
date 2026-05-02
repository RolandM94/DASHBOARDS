export type JsonObject = Record<string, unknown>;

export interface SectionGeneratorSectionRow {
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
  section_prompt?: string | null;
  section_config: JsonObject;
  metadata: JsonObject;
  status: string;
}

export interface SectionGeneratorBlueprintRow {
  id: string;
  report_project_id: string;
  status: string;
  title: string;
  objective?: string | null;
  audience?: string | null;
  blueprint_json: JsonObject;
}

export interface SectionGeneratorSnapshotRow {
  id: string;
  active_filters_snapshot: unknown;
  widgets_snapshot: unknown;
  worksheets_snapshot: unknown;
  insights_snapshot: unknown;
  query_outputs_snapshot: unknown;
  metadata: JsonObject;
  created_at: string;
}

export interface GenerateReportSectionOptions {
  instructions?: string;
  allowPreview?: boolean;
  regenerate?: boolean;
}

export interface GeneratedSectionPayload {
  title: string;
  content_markdown: string;
  key_findings: string[];
  recommendations: string[];
  source_references: Array<{
    widget_id?: string;
    worksheet_id?: string;
    insight_id?: string;
  }>;
  warnings: string[];
}

export function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

export function asRecordArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

export function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export function optionalStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function buildSectionSystemPrompt(): string {
  return `You are an AI report writer for a generic analytics dashboard product.

Write one report section using only the data provided in the input package.

Rules:
- Do not invent figures, categories, data fields, widgets, worksheets, filters, sources, or trends.
- Use exact figures only when they appear in the provided query output rows.
- Focus on the insight, implication, and user-facing message of the chart or source content.
- Do not explain worksheet setup, aggregation functions, query mechanics, source snapshot IDs, widget IDs, or internal dashboard implementation details.
- Do not write technical methodology unless the section explicitly asks for a user-facing methodology summary.
- Mention filters only when they are important business context for interpreting the insight; do not list raw filter JSON.
- Separate observation, interpretation, and recommendation when recommendations are requested.
- If evidence is incomplete, say so in warnings and avoid strong claims.
- Keep the writing professional, concise, and report-ready.
- Never claim access to data outside the supplied package.
- When referencing a chart or widget visual, use the placeholder syntax {{FIGURE:N}} where N is the figure number provided in the input package. Example: "As shown in {{FIGURE:1}}, sales grew 20% in Q1."
- Each widget you reference in your narrative should use its correct {{FIGURE:N}} placeholder.

Respond with ONLY a JSON object:
{
  "title": "Section title",
  "content_markdown": "Markdown narrative for this section (use {{FIGURE:N}} for chart references)",
  "key_findings": ["Finding supported by supplied data"],
  "recommendations": ["Recommendation supported by supplied data"],
  "source_references": [
    { "widget_id": "widget-id", "worksheet_id": "worksheet-id", "insight_id": "insight-id" }
  ],
  "warnings": ["Missing or incomplete data notes"]
}`;
}

export function linkedRecords(records: JsonObject[], ids: string[], idField = "id"): JsonObject[] {
  const wanted = new Set(ids);
  return records.filter((record) => wanted.has(String(record[idField] ?? "")));
}

export function buildSectionInputPackage(
  section: SectionGeneratorSectionRow,
  blueprint: SectionGeneratorBlueprintRow,
  snapshot: SectionGeneratorSnapshotRow,
  options: GenerateReportSectionOptions,
  figureAssignments?: Array<{ widget_id: string; figure_number: number; title: string }>
): JsonObject {
  const widgets = linkedRecords(asRecordArray(snapshot.widgets_snapshot), section.source_widget_ids);
  const worksheets = linkedRecords(asRecordArray(snapshot.worksheets_snapshot), section.source_worksheet_ids);
  const insights = linkedRecords(asRecordArray(snapshot.insights_snapshot), section.source_insight_ids);
  const queryOutputs = asRecord(snapshot.query_outputs_snapshot);
  const linkedQueryOutputs = Object.fromEntries(
    section.source_widget_ids
      .filter((widgetId) => queryOutputs[widgetId] !== undefined)
      .map((widgetId) => [widgetId, queryOutputs[widgetId]])
  );

  const inputPackage: JsonObject = {
    report: {
      title: blueprint.title,
      objective: blueprint.objective,
      audience: blueprint.audience,
      blueprint_status: blueprint.status,
    },
    section: {
      id: section.id,
      key: section.section_key,
      title: section.title,
      type: section.section_type,
      purpose: section.section_prompt,
      config: section.section_config,
      user_instructions: options.instructions,
    },
    source_snapshot: {
      id: snapshot.id,
      captured_at: snapshot.created_at,
      source: snapshot.metadata?.source,
      active_filters: snapshot.active_filters_snapshot,
      metadata: snapshot.metadata,
    },
    source_data: {
      widgets,
      worksheets,
      insights,
      query_outputs: linkedQueryOutputs,
    },
  };

  if (figureAssignments && figureAssignments.length > 0) {
    inputPackage.figures = figureAssignments.map((fa) => ({
      figure_number: fa.figure_number,
      widget_id: fa.widget_id,
      title: fa.title,
      placeholder: `{{FIGURE:${fa.figure_number}}}`,
    }));
  }

  return inputPackage;
}

export function parseGeneratedSection(raw: string, fallbackTitle: string): GeneratedSectionPayload {
  const parsed = JSON.parse(cleanJsonResponse(raw));
  const output = asRecord(parsed);
  const content = typeof output.content_markdown === "string" ? output.content_markdown.trim() : "";
  if (!content) throw new Error("AI returned empty section content");

  const sourceReferences = asRecordArray(output.source_references).map((reference) => ({
    widget_id: typeof reference.widget_id === "string" ? reference.widget_id : undefined,
    worksheet_id: typeof reference.worksheet_id === "string" ? reference.worksheet_id : undefined,
    insight_id: typeof reference.insight_id === "string" ? reference.insight_id : undefined,
  }));

  return {
    title: typeof output.title === "string" && output.title.trim() ? output.title.trim() : fallbackTitle,
    content_markdown: content,
    key_findings: optionalStringArray(output.key_findings),
    recommendations: optionalStringArray(output.recommendations),
    source_references: sourceReferences,
    warnings: optionalStringArray(output.warnings),
  };
}

export function validateSectionReferences(
  output: GeneratedSectionPayload,
  section: SectionGeneratorSectionRow
): string[] {
  const warnings: string[] = [];
  const widgetIds = new Set(section.source_widget_ids);
  const worksheetIds = new Set(section.source_worksheet_ids);
  const insightIds = new Set(section.source_insight_ids);

  for (const reference of output.source_references) {
    if (reference.widget_id && !widgetIds.has(reference.widget_id)) {
      warnings.push(`AI referenced unlinked widget ${reference.widget_id}; reference should be reviewed.`);
    }
    if (reference.worksheet_id && !worksheetIds.has(reference.worksheet_id)) {
      warnings.push(`AI referenced unlinked worksheet ${reference.worksheet_id}; reference should be reviewed.`);
    }
    if (reference.insight_id && !insightIds.has(reference.insight_id)) {
      warnings.push(`AI referenced unlinked insight ${reference.insight_id}; reference should be reviewed.`);
    }
  }

  return warnings;
}
