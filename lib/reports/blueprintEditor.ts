import {
  REPORT_BLUEPRINT_COLUMNS,
  REPORT_SECTION_COLUMNS,
  REPORT_SOURCE_SNAPSHOT_COLUMNS,
  type SupabaseRouteClient,
} from "@/lib/reports/api";
import {
  buildReportBlueprintPatch,
  buildReportSectionInsert,
  dbToReportBlueprint,
  dbToReportSection,
  optionalStringArray,
} from "@/lib/reports/models";
import type { ReportBlueprint, ReportSection } from "@/types";

type JsonObject = Record<string, unknown>;

interface BlueprintRow {
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

interface SnapshotRow {
  widgets_snapshot: unknown;
  metadata: JsonObject;
}

export interface BlueprintWithSections {
  blueprint: ReportBlueprint;
  sections: ReportSection[];
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

async function getBlueprintRow(
  supabase: SupabaseRouteClient,
  blueprintId: string
): Promise<BlueprintRow> {
  const { data, error } = await supabase
    .from("report_blueprints")
    .select(REPORT_BLUEPRINT_COLUMNS)
    .eq("id", blueprintId)
    .single();

  if (error || !data) throw new Error("Report blueprint not found");
  return data as BlueprintRow;
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

export async function getBlueprintWithSections(
  supabase: SupabaseRouteClient,
  blueprintId: string
): Promise<BlueprintWithSections> {
  const blueprint = await getBlueprintRow(supabase, blueprintId);
  const { data: sections, error } = await supabase
    .from("report_sections")
    .select(REPORT_SECTION_COLUMNS)
    .eq("report_blueprint_id", blueprintId)
    .order("order_index", { ascending: true });

  if (error) throw new Error(error.message);

  return {
    blueprint: dbToReportBlueprint(blueprint as unknown as Record<string, unknown>),
    sections: (sections ?? []).map((section) => dbToReportSection(section)),
  };
}

async function cloneBlueprintVersion(
  supabase: SupabaseRouteClient,
  blueprint: BlueprintRow,
  patch: JsonObject = {}
): Promise<BlueprintRow> {
  const version = await nextBlueprintVersion(supabase, blueprint.report_project_id);
  const nextJson = {
    ...(blueprint.blueprint_json ?? {}),
    ...(patch.blueprint_json && typeof patch.blueprint_json === "object" ? patch.blueprint_json as JsonObject : {}),
    previous_blueprint_id: blueprint.id,
  };

  const insert = {
    report_project_id: blueprint.report_project_id,
    version,
    status: patch.status ?? "draft",
    title: patch.title ?? blueprint.title,
    objective: patch.objective !== undefined ? patch.objective : blueprint.objective,
    audience: patch.audience !== undefined ? patch.audience : blueprint.audience,
    blueprint_json: nextJson,
    generated_by_ai: false,
  };

  const { data: newBlueprint, error } = await supabase
    .from("report_blueprints")
    .insert(insert)
    .select(REPORT_BLUEPRINT_COLUMNS)
    .single();

  if (error || !newBlueprint) throw new Error(error?.message ?? "New blueprint version could not be created");

  const { data: oldSections, error: oldSectionsError } = await supabase
    .from("report_sections")
    .select(REPORT_SECTION_COLUMNS)
    .eq("report_blueprint_id", blueprint.id)
    .order("order_index", { ascending: true });

  if (oldSectionsError) throw new Error(oldSectionsError.message);

  const sectionCopies = (oldSections ?? []).map((section) => ({
    report_project_id: section.report_project_id,
    report_blueprint_id: newBlueprint.id,
    parent_section_id: null,
    section_key: section.section_key,
    title: section.title,
    section_type: section.section_type,
    order_index: section.order_index,
    source_widget_ids: section.source_widget_ids ?? [],
    source_worksheet_ids: section.source_worksheet_ids ?? [],
    source_insight_ids: section.source_insight_ids ?? [],
    section_prompt: section.section_prompt,
    section_config: section.section_config ?? {},
    status: "pending",
    generated_content: null,
    edited_content: null,
    metadata: {
      ...(section.metadata ?? {}),
      copied_from_section_id: section.id,
    },
  }));

  if (sectionCopies.length > 0) {
    const { error: copyError } = await supabase
      .from("report_sections")
      .insert(sectionCopies);
    if (copyError) throw new Error(copyError.message);
  }

  await supabase
    .from("report_blueprints")
    .update({ status: "superseded" })
    .eq("id", blueprint.id);

  return newBlueprint as BlueprintRow;
}

export async function updateBlueprintMetadata(
  supabase: SupabaseRouteClient,
  blueprintId: string,
  body: JsonObject
): Promise<BlueprintWithSections & { createdNewVersion: boolean }> {
  const existing = await getBlueprintRow(supabase, blueprintId);
  const built = buildReportBlueprintPatch(body);
  if (built.error) throw new Error(built.error);

  if (existing.status === "approved" || existing.status === "locked") {
    const newBlueprint = await cloneBlueprintVersion(supabase, existing, built.data);
    return {
      ...await getBlueprintWithSections(supabase, newBlueprint.id),
      createdNewVersion: true,
    };
  }

  const patch = {
    ...built.data!,
    status: body.status ?? (existing.status === "draft" ? "edited" : existing.status),
  };

  const { data, error } = await supabase
    .from("report_blueprints")
    .update(patch)
    .eq("id", blueprintId)
    .select(REPORT_BLUEPRINT_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Report blueprint could not be updated");

  return {
    ...await getBlueprintWithSections(supabase, data.id),
    createdNewVersion: false,
  };
}

export async function createBlueprintVersion(
  supabase: SupabaseRouteClient,
  blueprintId: string
): Promise<BlueprintWithSections> {
  const blueprint = await getBlueprintRow(supabase, blueprintId);
  const newBlueprint = await cloneBlueprintVersion(supabase, blueprint);
  return getBlueprintWithSections(supabase, newBlueprint.id);
}

export async function addSectionToBlueprint(
  supabase: SupabaseRouteClient,
  blueprintId: string,
  body: JsonObject
): Promise<ReportSection> {
  const blueprint = await getBlueprintRow(supabase, blueprintId);
  if (blueprint.status === "approved" || blueprint.status === "locked") {
    throw new Error("Approved or locked blueprints must be versioned before adding sections");
  }

  const { data: latest } = await supabase
    .from("report_sections")
    .select("order_index")
    .eq("report_blueprint_id", blueprintId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const built = buildReportSectionInsert({
    ...body,
    reportBlueprintId: blueprintId,
    orderIndex: typeof body.orderIndex === "number" ? body.orderIndex : Number(latest?.order_index ?? -1) + 1,
  }, blueprint.report_project_id);
  if (built.error) throw new Error(built.error);

  const { data, error } = await supabase
    .from("report_sections")
    .insert(built.data!)
    .select(REPORT_SECTION_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Report section could not be created");

  await supabase
    .from("report_blueprints")
    .update({ status: blueprint.status === "draft" ? "edited" : blueprint.status })
    .eq("id", blueprintId);

  return dbToReportSection(data);
}

export async function reorderBlueprintSections(
  supabase: SupabaseRouteClient,
  blueprintId: string,
  sectionIds: string[]
): Promise<ReportSection[]> {
  const blueprint = await getBlueprintRow(supabase, blueprintId);
  if (blueprint.status === "approved" || blueprint.status === "locked") {
    throw new Error("Approved or locked blueprints must be versioned before reordering sections");
  }

  const { data: existingSections, error } = await supabase
    .from("report_sections")
    .select("id")
    .eq("report_blueprint_id", blueprintId);
  if (error) throw new Error(error.message);

  const existingIds = new Set((existingSections ?? []).map((section) => String(section.id)));
  if (sectionIds.length !== existingIds.size || sectionIds.some((sectionId) => !existingIds.has(sectionId))) {
    throw new Error("sectionIds must include each section in this blueprint exactly once");
  }

  for (const [index, sectionId] of sectionIds.entries()) {
    const { error: updateError } = await supabase
      .from("report_sections")
      .update({ order_index: index })
      .eq("id", sectionId)
      .eq("report_blueprint_id", blueprintId);
    if (updateError) throw new Error(updateError.message);
  }

  await supabase
    .from("report_blueprints")
    .update({ status: blueprint.status === "draft" ? "edited" : blueprint.status })
    .eq("id", blueprintId);

  const { sections } = await getBlueprintWithSections(supabase, blueprintId);
  return sections;
}

async function latestSnapshot(
  supabase: SupabaseRouteClient,
  reportProjectId: string
): Promise<SnapshotRow | undefined> {
  const { data } = await supabase
    .from("report_source_snapshots")
    .select(REPORT_SOURCE_SNAPSHOT_COLUMNS)
    .eq("report_project_id", reportProjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as SnapshotRow | undefined;
}

function validateApproval(
  blueprint: ReportBlueprint,
  sections: ReportSection[],
  snapshot?: SnapshotRow
): string[] {
  const errors: string[] = [];
  if (!blueprint.title.trim()) errors.push("Blueprint title is required.");
  if (sections.length === 0) errors.push("Blueprint must have at least one section.");

  const sortedIndexes = sections.map((section) => section.orderIndex).sort((a, b) => a - b);
  sortedIndexes.forEach((orderIndex, expected) => {
    if (orderIndex !== expected) errors.push("Sections must have contiguous order indexes starting at 0.");
  });

  const sourceWidgetIds = new Set(
    asRecordArray(snapshot?.widgets_snapshot)
      .map((widget) => String(widget.id ?? ""))
      .filter(Boolean)
  );
  if (snapshot && sourceWidgetIds.size > 0) {
    for (const section of sections) {
      for (const widgetId of section.sourceWidgetIds) {
        if (!sourceWidgetIds.has(widgetId)) {
          errors.push(`Section "${section.title}" links to a widget that is not in the latest source snapshot: ${widgetId}.`);
        }
      }
    }
  }

  return Array.from(new Set(errors));
}

export async function approveBlueprint(
  supabase: SupabaseRouteClient,
  blueprintId: string,
  userId: string,
  lock = false
): Promise<BlueprintWithSections> {
  const { blueprint, sections } = await getBlueprintWithSections(supabase, blueprintId);
  const snapshot = await latestSnapshot(supabase, blueprint.reportProjectId);
  const validationErrors = validateApproval(blueprint, sections, snapshot);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" "));
  }

  const approvedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("report_blueprints")
    .update({
      status: lock ? "locked" : "approved",
      approved_by: userId,
      approved_at: approvedAt,
    })
    .eq("id", blueprintId)
    .select(REPORT_BLUEPRINT_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Blueprint could not be approved");

  await supabase
    .from("report_projects")
    .update({ status: "blueprint_approved" })
    .eq("id", blueprint.reportProjectId);

  return getBlueprintWithSections(supabase, blueprintId);
}

export async function lockBlueprint(
  supabase: SupabaseRouteClient,
  blueprintId: string,
  userId: string
): Promise<BlueprintWithSections> {
  return approveBlueprint(supabase, blueprintId, userId, true);
}

export function parseSectionIds(body: JsonObject): { sectionIds?: string[]; error?: string } {
  const sectionIds = optionalStringArray(body.sectionIds ?? body.section_ids);
  if (!sectionIds || sectionIds.length === 0) return { error: "sectionIds is required" };
  return { sectionIds };
}
