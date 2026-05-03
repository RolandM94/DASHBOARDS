import { type SupabaseRouteClient } from "@/lib/reports/api";
import {
  buildReferenceDocumentInsert,
  buildTemplateInsert,
  buildTemplatePatch,
  dbToReferenceDocument,
  dbToTemplate,
} from "@/lib/reports/templateModels";
import type { ReportTemplate, ReferenceDocument } from "@/types";

type JsonObject = Record<string, unknown>;

const TEMPLATE_COLUMNS = "id, name, description, layout_json, reference_document_ids, created_by, created_at, updated_at";
const REF_DOC_COLUMNS = "id, template_id, report_project_id, filename, file_url, file_type, extracted_text, page_count, metadata, created_by, created_at";

// ── Templates ─────────────────────────────────────────────────────────────────

export async function createTemplate(
  supabase: SupabaseRouteClient,
  body: JsonObject,
  userId: string
): Promise<ReportTemplate> {
  const built = buildTemplateInsert(body, userId);
  if (built.error) throw new Error(built.error);

  const { data, error } = await supabase
    .from("report_templates")
    .insert(built.data!)
    .select(TEMPLATE_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Template could not be created");
  return dbToTemplate(data);
}

export async function getTemplates(supabase: SupabaseRouteClient, userId: string): Promise<ReportTemplate[]> {
  const { data, error } = await supabase
    .from("report_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("created_by", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => dbToTemplate(row));
}

export async function getTemplate(supabase: SupabaseRouteClient, templateId: string, userId?: string): Promise<ReportTemplate | null> {
  let query = supabase
    .from("report_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", templateId);

  if (userId) query = query.eq("created_by", userId);

  const { data, error } = await query.single();

  if (error || !data) return null;
  return dbToTemplate(data);
}

export async function updateTemplate(
  supabase: SupabaseRouteClient,
  templateId: string,
  body: JsonObject,
  userId?: string
): Promise<ReportTemplate> {
  const built = buildTemplatePatch(body);
  if (built.error) throw new Error(built.error);

  let query = supabase
    .from("report_templates")
    .update(built.data!)
    .eq("id", templateId);

  if (userId) query = query.eq("created_by", userId);

  const { data, error } = await query
    .select(TEMPLATE_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Template could not be updated");
  return dbToTemplate(data);
}

export async function deleteTemplate(supabase: SupabaseRouteClient, templateId: string, userId?: string): Promise<void> {
  let query = supabase
    .from("report_templates")
    .delete()
    .eq("id", templateId);

  if (userId) query = query.eq("created_by", userId);

  const { error } = await query;

  if (error) throw new Error(error.message);
}

// ── Reference Documents ───────────────────────────────────────────────────────

export async function addReferenceDocument(
  supabase: SupabaseRouteClient,
  body: JsonObject,
  userId: string
): Promise<ReferenceDocument> {
  const built = buildReferenceDocumentInsert(body, userId);
  if (built.error) throw new Error(built.error);

  const { data, error } = await supabase
    .from("template_reference_documents")
    .insert(built.data!)
    .select(REF_DOC_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Reference document could not be added");
  return dbToReferenceDocument(data);
}

export async function getTemplateDocuments(supabase: SupabaseRouteClient, templateId: string, userId?: string): Promise<ReferenceDocument[]> {
  let query = supabase
    .from("template_reference_documents")
    .select(REF_DOC_COLUMNS)
    .eq("template_id", templateId);

  if (userId) query = query.eq("created_by", userId);

  const { data, error } = await query
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => dbToReferenceDocument(row));
}

export async function deleteReferenceDocument(supabase: SupabaseRouteClient, docId: string, userId?: string): Promise<void> {
  let query = supabase
    .from("template_reference_documents")
    .delete()
    .eq("id", docId);

  if (userId) query = query.eq("created_by", userId);

  const { error } = await query;

  if (error) throw new Error(error.message);
}

export async function updateReferenceDocumentText(
  supabase: SupabaseRouteClient,
  docId: string,
  extractedText: string,
  pageCount: number,
  userId?: string
): Promise<void> {
  let query = supabase
    .from("template_reference_documents")
    .update({ extracted_text: extractedText, page_count: pageCount })
    .eq("id", docId);

  if (userId) query = query.eq("created_by", userId);

  const { error } = await query;

  if (error) throw new Error(error.message);
}

// ── Template → Blueprint mapping ──────────────────────────────────────────────

export function templateToBlueprintLayout(template: ReportTemplate): JsonObject {
  const sections = (template.layoutJson?.sections ?? []).map((section, index) => ({
    section_key: section.section_key ?? `section-${index + 1}`,
    title: section.title ?? `Section ${index + 1}`,
    section_type: section.section_type ?? "custom",
    source_widget_ids: (section.layout?.rows ?? []).flatMap((row) =>
      (row.columns ?? []).filter((col) => col.type === "chart").map((col) => col.widget_selector?.value ?? "").filter(Boolean)
    ),
  }));

  return {
    title: template.name,
    objective: template.description ?? "",
    sections,
  };
}
