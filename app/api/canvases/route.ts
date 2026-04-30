import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function dbToCanvas(c: Record<string, unknown>) {
  return {
    id: c.id,
    name: c.name,
    blocks: c.blocks ?? [],
    layout: c.layout ?? undefined,
    published: c.published ?? false,
    publishedTitle: c.published_title ?? undefined,
    publishedPermission: c.published_permission ?? undefined,
    publishedAt: c.published_at ?? undefined,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

// GET /api/canvases — list the current user's canvases
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("canvases")
    .select("id, name, blocks, layout, published, published_title, published_permission, published_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(dbToCanvas));
}

// POST /api/canvases — create a new canvas
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { name } = body as { name: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Canvas name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("canvases")
    .insert({ user_id: user.id, name: name.trim() })
    .select("id, name, blocks, layout, published, published_title, published_permission, published_at, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(dbToCanvas(data as Record<string, unknown>), { status: 201 });
}
