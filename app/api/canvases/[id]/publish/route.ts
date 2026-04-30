import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * POST /api/canvases/[id]/publish
 * Takes a snapshot of the canvas and upserts it into the dashboards table.
 * Also updates the canvas's published metadata.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json();
  const { title, permission } = body as { title: string; permission: string };

  if (!title?.trim() || !permission) {
    return NextResponse.json({ error: "title and permission are required" }, { status: 400 });
  }

  // Fetch the current canvas to snapshot its blocks and layout
  const { data: canvas, error: fetchErr } = await supabase
    .from("canvases")
    .select("blocks, layout")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !canvas) {
    return NextResponse.json({ error: "Canvas not found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Upsert the published dashboard snapshot
  const { error: dashErr } = await supabase
    .from("dashboards")
    .upsert({
      id,                     // same id as the canvas
      canvas_id: id,
      user_id: user.id,
      title: title.trim(),
      permission,
      published_at: now,
      blocks: canvas.blocks,
      layout: canvas.layout,
    });

  if (dashErr) return NextResponse.json({ error: dashErr.message }, { status: 500 });

  // Mark canvas as published
  const { error: canvasErr } = await supabase
    .from("canvases")
    .update({
      published: true,
      published_title: title.trim(),
      published_permission: permission,
      published_at: now,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (canvasErr) return NextResponse.json({ error: canvasErr.message }, { status: 500 });

  return NextResponse.json({
    id,
    canvasId: id,
    title: title.trim(),
    permission,
    publishedAt: now,
    blocks: canvas.blocks,
    layout: canvas.layout,
  }, { status: 200 });
}
