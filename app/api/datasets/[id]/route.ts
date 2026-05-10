import { createClient } from "@/lib/supabase/server";
import { invalidateDatasetCache } from "@/lib/data/aggregateCache";
import { NextResponse } from "next/server";
import type { DatasetField } from "@/types";

// PATCH /api/datasets/[id]
// Updates the fields array (used to persist field descriptions).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json() as { fields?: DatasetField[] };
  if (!body.fields) return NextResponse.json({ error: "fields required" }, { status: 400 });

  const { error } = await supabase
    .from("datasets")
    .update({ fields: body.fields })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/datasets/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { error } = await supabase
    .from("datasets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateDatasetCache(id);

  return new NextResponse(null, { status: 204 });
}
