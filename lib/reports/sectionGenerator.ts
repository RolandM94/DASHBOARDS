import Anthropic from "@anthropic-ai/sdk";
import {
  REPORT_BLUEPRINT_COLUMNS,
  REPORT_SECTION_COLUMNS,
  REPORT_SOURCE_SNAPSHOT_COLUMNS,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import { dbToReportSection } from "@/lib/reports/models";
import {
  buildSectionInputPackage,
  buildSectionSystemPrompt,
  parseGeneratedSection,
  validateSectionReferences,
  type GeneratedSectionPayload,
  type GenerateReportSectionOptions,
  type JsonObject,
  type SectionGeneratorBlueprintRow,
  type SectionGeneratorSectionRow,
  type SectionGeneratorSnapshotRow,
} from "@/lib/reports/sectionGeneratorCore";
import type { ReportSection } from "@/types";

const SECTION_GENERATOR_MODEL = "claude-haiku-4-5-20251001";

export type { GeneratedSectionPayload, GenerateReportSectionOptions };

export interface GenerateSectionResult {
  section: ReportSection;
  output: GeneratedSectionPayload;
}

export interface GenerateAllSectionsResult {
  generated: GenerateSectionResult[];
  failed: Array<{ sectionId: string; error: string }>;
}

async function getSectionRow(
  supabase: SupabaseRouteClient,
  sectionId: string
): Promise<SectionGeneratorSectionRow> {
  const { data, error } = await supabase
    .from("report_sections")
    .select(REPORT_SECTION_COLUMNS)
    .eq("id", sectionId)
    .single();

  if (error || !data) throw new Error("Report section not found");
  return data as SectionGeneratorSectionRow;
}

async function getBlueprintRow(
  supabase: SupabaseRouteClient,
  blueprintId: string
): Promise<SectionGeneratorBlueprintRow> {
  const { data, error } = await supabase
    .from("report_blueprints")
    .select(REPORT_BLUEPRINT_COLUMNS)
    .eq("id", blueprintId)
    .single();

  if (error || !data) throw new Error("Report blueprint not found");
  return data as SectionGeneratorBlueprintRow;
}

async function getLatestSnapshot(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<SectionGeneratorSnapshotRow> {
  const { data, error } = await supabase
    .from("report_source_snapshots")
    .select(REPORT_SOURCE_SNAPSHOT_COLUMNS)
    .eq("report_project_id", reportProjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) throw new Error("No source snapshot found for this report project");
  return data as SectionGeneratorSnapshotRow;
}

export async function generateReportSection(
  supabase: SupabaseRouteClient,
  sectionId: string,
  options: GenerateReportSectionOptions = {}
): Promise<GenerateSectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

  const section = await getSectionRow(supabase, sectionId);
  if (!section.report_blueprint_id) throw new Error("Report section is not linked to a blueprint");

  const blueprint = await getBlueprintRow(supabase, section.report_blueprint_id);
  if (!options.allowPreview && blueprint.status !== "approved" && blueprint.status !== "locked") {
    throw new Error("Report sections can only be generated from approved or locked blueprints unless preview mode is enabled");
  }

  const snapshot = await getLatestSnapshot(supabase, section.report_project_id);

  await supabase
    .from("report_sections")
    .update({ status: "generating" })
    .eq("id", sectionId);

  try {
    const client = new Anthropic({ apiKey });

    // Assign per-section figure numbers for {{FIGURE:N}} placeholders
    const widgets = Array.isArray(snapshot.widgets_snapshot) ? snapshot.widgets_snapshot as Array<Record<string, unknown>> : [];
    const figureAssignments = section.source_widget_ids.map((widgetId, index) => {
      const widget = widgets.find((w) => w.id === widgetId);
      return {
        widget_id: widgetId,
        figure_number: index + 1, // Per-section local numbering; global numbers assigned at compile time
        title: String(widget?.title ?? "Widget"),
      };
    });

    const inputPackage = buildSectionInputPackage(section, blueprint, snapshot, options, figureAssignments);
    const message = await client.messages.create({
      model: SECTION_GENERATOR_MODEL,
      max_tokens: 2600,
      system: buildSectionSystemPrompt(),
      messages: [
        {
          role: "user",
          content: JSON.stringify(inputPackage),
        },
      ],
    });

    const raw = message.content
      .filter((content) => content.type === "text")
      .map((content) => (content as { type: "text"; text: string }).text)
      .join("");

    const output = parseGeneratedSection(raw, section.title);
    output.warnings = Array.from(new Set([
      ...output.warnings,
      ...validateSectionReferences(output, section),
    ]));

    const patch: JsonObject = {
      status: "generated",
      generated_content: output.content_markdown,
      metadata: {
        ...(section.metadata ?? {}),
        generated_output: {
          title: output.title,
          key_findings: output.key_findings,
          recommendations: output.recommendations,
          source_references: output.source_references,
          warnings: output.warnings,
          source_snapshot_id: snapshot.id,
          generated_at: new Date().toISOString(),
          model: SECTION_GENERATOR_MODEL,
          preview_mode: Boolean(options.allowPreview),
        },
      },
    };
    if (options.regenerate) patch.edited_content = null;

    const { data: updatedSection, error } = await supabase
      .from("report_sections")
      .update(patch)
      .eq("id", sectionId)
      .select(REPORT_SECTION_COLUMNS)
      .single();

    if (error || !updatedSection) throw new Error(error?.message ?? "Generated section could not be stored");

    return {
      section: dbToReportSection(updatedSection),
      output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Section generation failed";
    await supabase
      .from("report_sections")
      .update({
        status: "failed",
        metadata: {
          ...(section.metadata ?? {}),
          generation_error: message,
          failed_at: new Date().toISOString(),
        },
      })
      .eq("id", sectionId);
    throw error;
  }
}

export async function generateAllReportSections(
  supabase: SupabaseRouteClient,
  reportProjectId: string,
  options: GenerateReportSectionOptions = {}
): Promise<GenerateAllSectionsResult> {
  const { data: sections, error } = await supabase
    .from("report_sections")
    .select(REPORT_SECTION_COLUMNS)
    .eq("report_project_id", reportProjectId)
    .order("order_index", { ascending: true });

  if (error) throw new Error(error.message);

  await supabase
    .from("report_projects")
    .update({ status: "generating" })
    .eq("id", reportProjectId);

  const generated: GenerateSectionResult[] = [];
  const failed: Array<{ sectionId: string; error: string }> = [];

  for (const section of sections ?? []) {
    try {
      generated.push(await generateReportSection(supabase, section.id, options));
    } catch (error) {
      failed.push({
        sectionId: String(section.id),
        error: error instanceof Error ? error.message : "Section generation failed",
      });
    }
  }

  await supabase
    .from("report_projects")
    .update({ status: failed.length > 0 ? "failed" : "generated" })
    .eq("id", reportProjectId);

  return { generated, failed };
}

export { SECTION_GENERATOR_MODEL };
