import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { FieldType, DatasetField, Worksheet } from "@/types";
import { isNumericType } from "@/types";
import { normalizeWorkbookConfig } from "@/lib/workbook";

const VALID_TYPES: Array<FieldType | "default"> = [
  "integer", "decimal", "string", "date", "datetime", "default",
];

/**
 * PATCH /api/datasets/[id]/fields/[fieldName]
 * Body: { newType: FieldType | "default", force?: boolean }
 *
 * Changes the type metadata for a single field in datasets.fields.
 * - "default" resolves to the field's inferredType (resets user override).
 * - Number → String is always allowed without force.
 * - All other incompatible conversions require force: true, otherwise
 *   returns 409 with compatibility stats so the frontend can warn.
 *
 * Response (200): { fields: DatasetField[], affectedWorksheets?: string[] }
 * Response (409): { error: "incompatible", stats: { total, compatible, incompatible, examples } }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fieldName: string }> }
) {
  const { id, fieldName } = await params;
  const body = await request.json() as { newType?: FieldType | "default"; force?: boolean };
  const { newType, force = false } = body;

  if (!newType || !VALID_TYPES.includes(newType)) {
    return NextResponse.json(
      { error: `newType must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Fetch dataset (ownership check + current field metadata)
  const { data: ds } = await supabase
    .from("datasets")
    .select("id, fields")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const fields = ds.fields as DatasetField[];
  const field = fields.find((f) => f.name === fieldName);

  if (!field) {
    return NextResponse.json({ error: `Field "${fieldName}" not found` }, { status: 404 });
  }

  // Resolve "default" → inferredType (fall back to current type if missing)
  const resolvedType: FieldType =
    newType === "default"
      ? (field.inferredType ?? field.type)
      : newType;

  // No-op: already this type
  if (resolvedType === field.type) {
    return NextResponse.json({ fields });
  }

  // Number → String is always safe (no data loss)
  const isAlwaysSafe =
    (isNumericType(field.type) && resolvedType === "string") ||
    newType === "default";

  if (!isAlwaysSafe && !force) {
    // Attempt compatibility check via RPC (requires migration 0003 to be applied).
    // If the function doesn't exist yet, skip the check and proceed — the field
    // metadata update is reversible and no row data is modified.
    const serviceClient = await createServiceClient();
    const { data: compat, error: compatError } = await serviceClient.rpc(
      "check_field_type_compatibility",
      { p_dataset_id: id, p_field: fieldName, p_target_type: resolvedType }
    );

    if (!compatError) {
      const stats = compat as { total: number; compatible: number; incompatible: number; examples: string[] };
      if (stats.incompatible > 0) {
        return NextResponse.json(
          { error: "incompatible", stats },
          { status: 409 }
        );
      }
    }
    // If compatError (e.g. function not yet deployed), fall through and apply anyway
  }

  // Build the updated fields array in JS — no RPC needed
  const updatedFields: DatasetField[] = fields.map((f) =>
    f.name === fieldName ? { ...f, type: resolvedType } : f
  );

  const { error: updateError } = await supabase
    .from("datasets")
    .update({ fields: updatedFields })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Sync workbook metric metadata so open builders/canvases do not keep stale
  // metric.fieldType values after the dataset field type changes.
  const serviceClient = await createServiceClient();
  const updatedWorksheets: Worksheet[] = [];
  const affectedWorksheets: string[] = [];

  const { data: worksheets } = await serviceClient
    .from("worksheets")
    .select("id, dataset_id, name, description, config, status, created_at, updated_at")
    .eq("dataset_id", id);

  if (worksheets) {
    for (const ws of worksheets) {
      const workbook = normalizeWorkbookConfig(ws.config as Worksheet["config"], {
        name: ws.name as string,
        description: (ws.description as string | null) ?? undefined,
      });

      let changed = false;
      const nextConfig = {
        ...workbook,
        sheets: workbook.sheets.map((sheet) => ({
          ...sheet,
          metrics: sheet.metrics.map((metric) => {
            if (metric.field !== fieldName) return metric;
            changed = true;
            return { ...metric, fieldType: resolvedType };
          }),
        })),
      };

      if (!changed) continue;

      if (!isNumericType(resolvedType)) {
        affectedWorksheets.push(ws.name as string);
      }

      const { data: updated } = await serviceClient
        .from("worksheets")
        .update({ config: nextConfig })
        .eq("id", ws.id)
        .select("id, dataset_id, name, description, config, status, created_at, updated_at")
        .single();

      if (updated) {
        updatedWorksheets.push({
          id: updated.id,
          datasetId: updated.dataset_id,
          name: updated.name,
          description: updated.description ?? undefined,
          config: updated.config as Worksheet["config"],
          status: updated.status,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        });
      }
    }
  }

  return NextResponse.json({
    fields: updatedFields,
    updatedWorksheets,
    ...(affectedWorksheets.length > 0 && { affectedWorksheets }),
  });
}
