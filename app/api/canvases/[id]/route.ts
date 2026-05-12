import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CANVAS_COLUMNS, dbToCanvas, getCanvasPermission } from "@/lib/canvas/access";

// GET /api/canvases/[id] — load a canvas the user can read.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("canvases")
    .select(CANVAS_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  const permission = await getCanvasPermission(supabase, serviceClient, id, user.id);
  if (!permission) return NextResponse.json({ error: "Canvas not found" }, { status: 404 });

  return NextResponse.json(dbToCanvas(data as Record<string, unknown>, {
    currentUserId: user.id,
    sharedPermissions: { [id]: permission },
  }));
}

// PATCH /api/canvases/[id] — update blocks, layout, name, or publish metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { name, blocks, layout, published, publishedTitle, publishedPermission, publishedAt } = body as {
    name?: string;
    blocks?: unknown;
    layout?: unknown;
    published?: boolean;
    publishedTitle?: string;
    publishedPermission?: string;
    publishedAt?: string;
  };

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (blocks !== undefined) patch.blocks = blocks;
  if (layout !== undefined) patch.layout = layout;
  if (published !== undefined) patch.published = published;
  if (publishedTitle !== undefined) patch.published_title = publishedTitle;
  if (publishedPermission !== undefined) patch.published_permission = publishedPermission;
  if (publishedAt !== undefined) patch.published_at = publishedAt;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const permission = await getCanvasPermission(supabase, serviceClient, id, user.id);
  if (permission !== "owner" && permission !== "editor") {
    return NextResponse.json({ error: "Canvas not found or access denied" }, { status: 404 });
  }

  const { error } = await supabase
    .from("canvases")
    .update(patch)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

// DELETE /api/canvases/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { error } = await supabase
    .from("canvases")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
