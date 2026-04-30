import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// PATCH /api/canvases/[id] — update blocks, layout, name, or publish metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
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

  const { error } = await supabase
    .from("canvases")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

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
