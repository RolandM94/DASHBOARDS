import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { FieldType } from "@/types";

const VALID_TARGET_TYPES: FieldType[] = [
  "integer", "decimal", "string", "date", "datetime",
];

/**
 * GET /api/datasets/[id]/fields/[fieldName]/compatibility?targetType=decimal
 *
 * Returns how many rows are compatible / incompatible with a proposed type change.
 * Used by the frontend to decide whether to show a warning before confirming.
 *
 * Response: { total: number, compatible: number, incompatible: number, examples: string[] }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fieldName: string }> }
) {
  const { id, fieldName } = await params;
  const targetType = request.nextUrl.searchParams.get("targetType") as FieldType | null;

  if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
    return NextResponse.json(
      { error: `targetType must be one of: ${VALID_TARGET_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Verify ownership
  const { data: ds } = await supabase
    .from("datasets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient.rpc("check_field_type_compatibility", {
    p_dataset_id:  id,
    p_field:       fieldName,
    p_target_type: targetType,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as {
    total: number;
    compatible: number;
    incompatible: number;
    examples: string[];
  };

  return NextResponse.json(result);
}
