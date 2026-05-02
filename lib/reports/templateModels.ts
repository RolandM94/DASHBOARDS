import type { ReferenceDocumentFileType, ReportTemplate, ReferenceDocument } from "@/types";

type JsonObject = Record<string, unknown>;
type Row = Record<string, unknown>;

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function optionalJsonObject(value: unknown): JsonObject | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

export const REFERENCE_DOCUMENT_FILE_TYPES = ["pdf", "docx", "txt", "md"] as const;

export function dbToTemplate(row: Row): ReportTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    layoutJson: (row.layout_json ?? { sections: [] }) as ReportTemplate["layoutJson"],
    referenceDocumentIds: Array.isArray(row.reference_document_ids)
      ? (row.reference_document_ids as string[])
      : [],
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function dbToReferenceDocument(row: Row): ReferenceDocument {
  return {
    id: String(row.id),
    templateId: row.template_id ? String(row.template_id) : undefined,
    reportProjectId: row.report_project_id ? String(row.report_project_id) : undefined,
    filename: String(row.filename),
    fileUrl: String(row.file_url),
    fileType: row.file_type as ReferenceDocumentFileType,
    extractedText: row.extracted_text ? String(row.extracted_text) : undefined,
    pageCount: Number(row.page_count),
    metadata: (row.metadata ?? {}) as JsonObject,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

export function buildTemplateInsert(body: JsonObject, userId: string): { data?: JsonObject; error?: string } {
  const name = optionalString(body.name);
  if (!name) return { error: "Template name is required" };

  const layoutJson = body.layoutJson;
  if (!layoutJson || typeof layoutJson !== "object" || Array.isArray(layoutJson)) {
    return { error: "layoutJson must be a plain object" };
  }
  const sections = (layoutJson as JsonObject).sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    return { error: "Template must have at least one section" };
  }

  return {
    data: {
      name,
      description: optionalString(body.description) ?? null,
      layout_json: layoutJson,
      reference_document_ids: optionalStringArray(body.referenceDocumentIds) ?? [],
      created_by: userId,
    },
  };
}

export function buildTemplatePatch(body: JsonObject): { data?: JsonObject; error?: string } {
  const patch: JsonObject = {};
  if (body.name !== undefined) {
    const name = optionalString(body.name);
    if (!name) return { error: "Template name cannot be empty" };
    patch.name = name;
  }
  if (body.description !== undefined) {
    patch.description = optionalString(body.description) ?? null;
  }
  if (body.layoutJson !== undefined) {
    const layoutJson = optionalJsonObject(body.layoutJson);
    if (!layoutJson) return { error: "layoutJson must be a plain object" };
    patch.layout_json = layoutJson;
  }
  if (body.referenceDocumentIds !== undefined) {
    patch.reference_document_ids = optionalStringArray(body.referenceDocumentIds) ?? [];
  }
  return Object.keys(patch).length === 0 ? { error: "No fields to update" } : { data: patch };
}

export function buildReferenceDocumentInsert(body: JsonObject, userId: string): { data?: JsonObject; error?: string } {
  const filename = optionalString(body.filename);
  const fileUrl = optionalString(body.fileUrl);
  if (!filename) return { error: "filename is required" };
  if (!fileUrl) return { error: "fileUrl is required" };

  const fileType = body.fileType;
  if (!REFERENCE_DOCUMENT_FILE_TYPES.includes(fileType as ReferenceDocumentFileType)) {
    return { error: `Invalid file type: ${fileType}` };
  }

  const templateId = optionalString(body.templateId);
  const reportProjectId = optionalString(body.reportProjectId);
  if (!templateId && !reportProjectId) {
    return { error: "templateId or reportProjectId is required" };
  }
  if (templateId && reportProjectId) {
    return { error: "Cannot specify both templateId and reportProjectId" };
  }

  return {
    data: {
      template_id: templateId ?? null,
      report_project_id: reportProjectId ?? null,
      filename,
      file_url: fileUrl,
      file_type: fileType,
      extracted_text: optionalString(body.extractedText) ?? null,
      page_count: typeof body.pageCount === "number" && body.pageCount > 0 ? body.pageCount : 0,
      metadata: optionalJsonObject(body.metadata) ?? {},
      created_by: userId,
    },
  };
}
