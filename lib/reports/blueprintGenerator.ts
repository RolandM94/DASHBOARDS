import Anthropic from "@anthropic-ai/sdk";
import {
  REPORT_BLUEPRINT_COLUMNS,
  REPORT_SECTION_COLUMNS,
  REPORT_SOURCE_SNAPSHOT_COLUMNS,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import {
  REPORT_SECTION_TYPES,
  buildReportBlueprintInsert,
  dbToReportBlueprint,
  dbToReportSection,
  isOneOf,
  optionalString,
  optionalStringArray,
} from "@/lib/reports/models";
import type {
  ReportBlueprint,
  ReportSection,
  ReportSectionType,
  ReportTemplate,
  ReportSourceSnapshot,
  ReportType,
  ReferenceDocument,
} from "@/types";

export interface GenerateReportBlueprintInput {
  instructions?: string;
  audience?: string;
  reportType?: ReportType;
  templateContext?: TemplatePromptContext;
}

export interface GenerateReportBlueprintResult {
  blueprint: ReportBlueprint;
  sections: ReportSection[];
  warnings: string[];
}

interface ReportProjectRow {
  id: string;
  name: string;
  description?: string | null;
  template_id?: string | null;
  report_type: ReportType;
  status: string;
}

interface SnapshotRow {
  id: string;
  report_project_id: string;
  source_type: "dashboard" | "canvas";
  source_id: string;
  active_filters_snapshot: unknown;
  widgets_snapshot: unknown;
  worksheets_snapshot: unknown;
  insights_snapshot: unknown;
  query_outputs_snapshot: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface CapturedWidget {
  id: string;
  title?: string;
  type?: string;
  worksheet_id?: string;
  sheet_id?: string;
  query_output?: {
    columns?: string[];
    rows?: unknown[];
  };
}

interface CapturedWorksheet {
  id: string;
  name?: string;
  description?: string;
  dataset_id?: string;
}

interface CapturedInsight {
  id: string;
  content?: string;
  worksheet_id?: string;
  sheet_id?: string;
}

interface BlueprintSectionCandidate {
  section_key: string;
  title: string;
  section_type: ReportSectionType;
  source_widget_ids: string[];
  source_worksheet_ids: string[];
  source_insight_ids: string[];
  purpose?: string;
  depth?: string;
}

interface SanitisedBlueprint {
  title: string;
  objective?: string;
  audience?: string;
  blueprintJson: Record<string, unknown>;
  sections: BlueprintSectionCandidate[];
  warnings: string[];
}

interface TemplatePromptContext {
  id: string;
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  referencePrompt?: string;
  sections: Array<{
    title: string;
    section_type: string;
    blocks: Array<{
      type: string;
      prompt?: string;
      default_content?: string;
      widget_selector?: Record<string, unknown>;
    }>;
  }>;
  referenceDocuments: Array<{
    filename: string;
    fileType: string;
    extractedText?: string;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function capturedWidgets(value: unknown): CapturedWidget[] {
  return asRecordArray(value)
    .map((widget) => ({
      id: String(widget.id ?? ""),
      title: optionalString(widget.title),
      type: optionalString(widget.type),
      worksheet_id: optionalString(widget.worksheet_id),
      sheet_id: optionalString(widget.sheet_id),
      query_output: asRecord(widget.query_output) as CapturedWidget["query_output"],
    }))
    .filter((widget) => widget.id.length > 0);
}

function capturedWorksheets(value: unknown): CapturedWorksheet[] {
  return asRecordArray(value)
    .map((worksheet) => ({
      id: String(worksheet.id ?? ""),
      name: optionalString(worksheet.name),
      description: optionalString(worksheet.description),
      dataset_id: optionalString(worksheet.dataset_id),
    }))
    .filter((worksheet) => worksheet.id.length > 0);
}

function capturedInsights(value: unknown): CapturedInsight[] {
  return asRecordArray(value)
    .map((insight) => ({
      id: String(insight.id ?? ""),
      content: optionalString(insight.content),
      worksheet_id: optionalString(insight.worksheet_id),
      sheet_id: optionalString(insight.sheet_id),
    }))
    .filter((insight) => insight.id.length > 0);
}

function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function snapshotFromRow(row: SnapshotRow): ReportSourceSnapshot {
  return {
    id: row.id,
    reportProjectId: row.report_project_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    activeFiltersSnapshot: row.active_filters_snapshot,
    widgetsSnapshot: row.widgets_snapshot,
    worksheetsSnapshot: row.worksheets_snapshot,
    insightsSnapshot: row.insights_snapshot,
    queryOutputsSnapshot: row.query_outputs_snapshot,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function buildBlueprintSystemPrompt(): string {
  return `You are an AI report planner for a generic analytics dashboard product.

Your task is to create a report blueprint from a captured dashboard/canvas snapshot.

Rules:
- Use only widget, worksheet, and insight IDs that appear in the snapshot.
- Do not invent numbers, metrics, datasets, widgets, worksheets, or source IDs.
- The system has already calculated all values. Treat query outputs as source evidence only.
- Group related widgets into coherent narrative sections.
- Include an executive summary when useful.
- Include a methodology/source note section when filters, snapshots, or multiple widgets are involved.
- Include recommendations only when there is enough source evidence.
- If report_template is provided, use its section order, section intent, block prompts, and chart/table placement as the primary structure unless it conflicts with available source evidence.
- Uploaded template reference document excerpts describe the desired format and tone; follow them for structure, not for factual claims.
- Flag missing analytical coverage in "warnings".
- Keep the report dataset-agnostic. Do not assume a government, budget, project, sales, or operations domain unless the source labels clearly say so.

Respond with ONLY a JSON object:
{
  "title": "Report title",
  "objective": "Report objective",
  "audience": "Audience",
  "report_type": "executive_summary | management_report | technical_report | custom_report",
  "sections": [
    {
      "section_key": "short_unique_key",
      "title": "Section title",
      "section_type": "executive_summary | introduction | methodology | chart_analysis | table_analysis | kpi_summary | risk_analysis | recommendation | appendix | custom",
      "source_widget_ids": ["widget-id"],
      "source_worksheet_ids": ["worksheet-uuid"],
      "source_insight_ids": ["insight-id"],
      "purpose": "Why this section exists",
      "depth": "short | standard | detailed"
    }
  ],
  "appendices": [],
  "export_preferences": {},
  "warnings": []
}`;
}

function buildBlueprintUserPrompt(
  project: ReportProjectRow,
  snapshot: ReportSourceSnapshot,
  input: GenerateReportBlueprintInput
): string {
  const widgets = asRecordArray(snapshot.widgetsSnapshot)
    .slice(0, 40)
    .map((widget) => {
      const queryOutput = asRecord(widget.query_output);
      const rows = Array.isArray(queryOutput.rows) ? queryOutput.rows.slice(0, 8) : [];
      return {
        id: widget.id,
        title: widget.title,
        type: widget.type,
        worksheet_id: widget.worksheet_id,
        sheet_id: widget.sheet_id,
        columns: queryOutput.columns,
        sample_rows: rows,
      };
    });

  const worksheets = asRecordArray(snapshot.worksheetsSnapshot)
    .slice(0, 60)
    .map((worksheet) => ({
      id: worksheet.id,
      name: worksheet.name,
      description: worksheet.description,
      dataset_id: worksheet.dataset_id,
    }));

  const insights = asRecordArray(snapshot.insightsSnapshot)
    .slice(0, 30)
    .map((insight) => ({
      id: insight.id,
      worksheet_id: insight.worksheet_id,
      sheet_id: insight.sheet_id,
      content: typeof insight.content === "string" ? insight.content.slice(0, 600) : "",
    }));

  const metadata = asRecord(snapshot.metadata);

  return JSON.stringify({
    report_project: {
      id: project.id,
      name: project.name,
      description: project.description,
      report_type: input.reportType ?? project.report_type,
      requested_audience: input.audience,
      instructions: input.instructions,
    },
    report_template: input.templateContext,
    source: metadata.source ?? {
      type: snapshot.sourceType,
      id: snapshot.sourceId,
    },
    active_filters: snapshot.activeFiltersSnapshot,
    captured_at: snapshot.createdAt,
    widgets,
    worksheets,
    insights,
    warnings_from_capture: metadata.warnings ?? [],
  });
}

function templateContextFromRows(
  template: ReportTemplate,
  documents: ReferenceDocument[]
): TemplatePromptContext {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    settings: template.layoutJson.settings,
    referencePrompt: template.layoutJson.referencePrompt,
    sections: (template.layoutJson.sections ?? []).map((section) => ({
      title: section.title,
      section_type: section.section_type,
      blocks: section.layout.rows.flatMap((row) =>
        row.columns.map((column) => ({
          type: column.type,
          prompt: column.prompt,
          default_content: column.default_content,
          widget_selector: column.widget_selector,
        }))
      ),
    })),
    referenceDocuments: documents.slice(0, 5).map((doc) => ({
      filename: doc.filename,
      fileType: doc.fileType,
      extractedText: doc.extractedText?.slice(0, 2500),
    })),
  };
}

async function getTemplateContext(
  supabase: SupabaseRouteClient,
  templateId?: string | null
): Promise<TemplatePromptContext | undefined> {
  if (!templateId) return undefined;

  const { data: template } = await supabase
    .from("report_templates")
    .select("id, name, description, layout_json, reference_document_ids, created_by, created_at, updated_at")
    .eq("id", templateId)
    .single();

  if (!template) return undefined;

  const { data: documents } = await supabase
    .from("template_reference_documents")
    .select("id, template_id, report_project_id, filename, file_url, file_type, extracted_text, page_count, metadata, created_by, created_at")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false });

  const model: ReportTemplate = {
    id: String(template.id),
    name: String(template.name),
    description: optionalString(template.description),
    layoutJson: (template.layout_json ?? { sections: [] }) as ReportTemplate["layoutJson"],
    referenceDocumentIds: Array.isArray(template.reference_document_ids) ? template.reference_document_ids as string[] : [],
    createdBy: String(template.created_by),
    createdAt: String(template.created_at),
    updatedAt: String(template.updated_at),
  };

  const docs: ReferenceDocument[] = asRecordArray(documents).map((doc) => ({
    id: String(doc.id),
    templateId: optionalString(doc.template_id),
    reportProjectId: optionalString(doc.report_project_id),
    filename: String(doc.filename),
    fileUrl: String(doc.file_url),
    fileType: doc.file_type as ReferenceDocument["fileType"],
    extractedText: optionalString(doc.extracted_text),
    pageCount: Number(doc.page_count ?? 0),
    metadata: asRecord(doc.metadata),
    createdBy: String(doc.created_by),
    createdAt: String(doc.created_at),
  }));

  return templateContextFromRows(model, docs);
}

function parseBlueprint(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(cleanJsonResponse(raw));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI returned a non-object blueprint");
  }
  return parsed as Record<string, unknown>;
}

function stableSectionKey(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || `section_${index + 1}`;
}

function sanitiseBlueprint(
  raw: Record<string, unknown>,
  project: ReportProjectRow,
  snapshot: ReportSourceSnapshot,
  input: GenerateReportBlueprintInput
): SanitisedBlueprint {
  const widgets = capturedWidgets(snapshot.widgetsSnapshot);
  const worksheets = capturedWorksheets(snapshot.worksheetsSnapshot);
  const insights = capturedInsights(snapshot.insightsSnapshot);
  const widgetIds = new Set(widgets.map((widget) => widget.id).filter(Boolean));
  const worksheetIds = new Set(worksheets.map((worksheet) => worksheet.id).filter(Boolean));
  const insightIds = new Set(insights.map((insight) => insight.id).filter(Boolean));
  const warnings = asRecordArray(raw.warnings).map((warning) => JSON.stringify(warning));
  if (Array.isArray(raw.warnings)) {
    warnings.push(...raw.warnings.filter((warning): warning is string => typeof warning === "string"));
  }

  const rawSections = asRecordArray(raw.sections);
  const sections: BlueprintSectionCandidate[] = rawSections.map((section, index) => {
    const title = optionalString(section.title) ?? `Section ${index + 1}`;
    const sectionType = isOneOf(section.section_type, REPORT_SECTION_TYPES)
      ? section.section_type
      : "custom";

    const sourceWidgetIds = (optionalStringArray(section.source_widget_ids) ?? [])
      .filter((id) => widgetIds.has(id));
    const sourceWorksheetIds = (optionalStringArray(section.source_worksheet_ids) ?? [])
      .filter((id) => worksheetIds.has(id));
    const inferredWorksheetIds = sourceWidgetIds
      .map((widgetId) => widgets.find((widget) => widget.id === widgetId)?.worksheet_id)
      .filter((id): id is string => Boolean(id && worksheetIds.has(id)));
    const sourceInsightIds = (optionalStringArray(section.source_insight_ids) ?? [])
      .filter((id) => insightIds.has(id));

    return {
      section_key: optionalString(section.section_key) ?? stableSectionKey(title, index),
      title,
      section_type: sectionType,
      source_widget_ids: sourceWidgetIds,
      source_worksheet_ids: Array.from(new Set([...sourceWorksheetIds, ...inferredWorksheetIds])),
      source_insight_ids: sourceInsightIds,
      purpose: optionalString(section.purpose),
      depth: optionalString(section.depth),
    };
  });

  if (sections.length === 0) {
    sections.push({
      section_key: "executive_summary",
      title: "Executive Summary",
      section_type: "executive_summary",
      source_widget_ids: widgets.slice(0, 5).map((widget) => widget.id).filter(Boolean),
      source_worksheet_ids: worksheets.slice(0, 5).map((worksheet) => worksheet.id).filter(Boolean),
      source_insight_ids: insights.slice(0, 5).map((insight) => insight.id).filter(Boolean),
      purpose: "Summarize the most important available dashboard evidence.",
      depth: "short",
    });
    warnings.push("AI did not return usable sections, so a minimal executive summary section was created.");
  }

  const hasWidgetCoverage = sections.some((section) => section.source_widget_ids.length > 0);
  if (!hasWidgetCoverage && widgets.length > 0) {
    warnings.push("The blueprint does not link any section to captured widgets.");
  }

  const title = optionalString(raw.title) ?? `${project.name} Report`;
  const objective = optionalString(raw.objective) ?? project.description ?? "Summarize the captured dashboard evidence.";
  const audience = input.audience ?? optionalString(raw.audience) ?? "Report readers";
  const blueprintJson = {
    ...raw,
    title,
    objective,
    audience,
    report_type: input.reportType ?? raw.report_type ?? project.report_type,
    sections,
    warnings,
    source_snapshot_id: snapshot.id,
  };

  return {
    title,
    objective,
    audience,
    blueprintJson,
    sections,
    warnings,
  };
}

async function nextBlueprintVersion(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<number> {
  const { data } = await supabase
    .from("report_blueprints")
    .select("version")
    .eq("report_project_id", reportProjectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(data?.version ?? 0) + 1;
}

export async function generateReportBlueprint(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  input: GenerateReportBlueprintInput = {}
): Promise<GenerateReportBlueprintResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

  const { data: project, error: projectError } = await supabase
    .from("report_projects")
    .select("id, name, description, template_id, report_type, status")
    .eq("id", reportProjectId)
    .single();

  if (projectError || !project) throw new Error("Report project not found");

  const { data: snapshot, error: snapshotError } = await supabase
    .from("report_source_snapshots")
    .select(REPORT_SOURCE_SNAPSHOT_COLUMNS)
    .eq("report_project_id", reportProjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (snapshotError || !snapshot) {
    throw new Error("No source snapshot found. Capture the report source before generating a blueprint.");
  }

  const projectRow = project as ReportProjectRow;
  const snapshotModel = snapshotFromRow(snapshot as SnapshotRow);
  const templateContext = await getTemplateContext(supabase, projectRow.template_id);
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2600,
    system: buildBlueprintSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildBlueprintUserPrompt(projectRow, snapshotModel, { ...input, templateContext }),
      },
    ],
  });

  const raw = message.content
    .filter((content) => content.type === "text")
    .map((content) => (content as { type: "text"; text: string }).text)
    .join("");

  const parsed = parseBlueprint(raw);
  const sanitised = sanitiseBlueprint(parsed, projectRow, snapshotModel, input);
  const version = await nextBlueprintVersion(supabase, reportProjectId);
  const blueprintInsert = buildReportBlueprintInsert({
    title: sanitised.title,
    objective: sanitised.objective,
    audience: sanitised.audience,
    blueprintJson: sanitised.blueprintJson,
    generatedByAi: true,
  }, reportProjectId, version);

  if (blueprintInsert.error) throw new Error(blueprintInsert.error);

  const { data: blueprint, error: blueprintError } = await supabase
    .from("report_blueprints")
    .insert(blueprintInsert.data!)
    .select(REPORT_BLUEPRINT_COLUMNS)
    .single();

  if (blueprintError || !blueprint) {
    throw new Error(blueprintError?.message ?? "Report blueprint could not be stored");
  }

  const sectionInserts = sanitised.sections.map((section, index) => ({
    report_project_id: reportProjectId,
    report_blueprint_id: blueprint.id,
    section_key: section.section_key,
    title: section.title,
    section_type: section.section_type,
    order_index: index,
    source_widget_ids: section.source_widget_ids,
    source_worksheet_ids: section.source_worksheet_ids,
    source_insight_ids: section.source_insight_ids,
    section_prompt: section.purpose ?? null,
    section_config: {
      purpose: section.purpose,
      depth: section.depth ?? "standard",
      source_snapshot_id: snapshotModel.id,
    },
    status: "pending",
    metadata: {},
  }));

  const { data: sectionRows, error: sectionError } = await supabase
    .from("report_sections")
    .insert(sectionInserts)
    .select(REPORT_SECTION_COLUMNS);

  if (sectionError) throw new Error(sectionError.message);

  await supabase
    .from("report_projects")
    .update({
      report_type: input.reportType ?? projectRow.report_type,
      status: "blueprint_generated",
    })
    .eq("id", reportProjectId);

  return {
    blueprint: dbToReportBlueprint(blueprint),
    sections: (sectionRows ?? []).map((section) => dbToReportSection(section)),
    warnings: sanitised.warnings,
  };
}
