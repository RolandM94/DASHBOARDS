import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// PATCH /api/worksheets/[id] — update worksheet name / description / config / status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { datasetId, name, description, config, status } = body as {
    datasetId?: string;
    name?: string;
    description?: string;
    config?: unknown;
    status?: string;
  };

  const patch: Record<string, unknown> = {};
  if (datasetId !== undefined) patch.dataset_id = datasetId;
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (config !== undefined) patch.config = config;
  if (status !== undefined) patch.status = status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("worksheets")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, dataset_id, name, description, config, status, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data.id,
    datasetId: data.dataset_id,
    name: data.name,
    description: data.description ?? undefined,
    config: data.config,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}

// DELETE /api/worksheets/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { error } = await supabase
    .from("worksheets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
