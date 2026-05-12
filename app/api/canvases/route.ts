import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CANVAS_COLUMNS, dbToCanvas, type CanvasPermission } from "@/lib/canvas/access";

// GET /api/canvases — list the current user's canvases
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("canvases")
    .select(CANVAS_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const canvasIds = (data ?? []).map((canvas) => canvas.id);
  const sharedPermissions: Record<string, CanvasPermission> = {};
  if (canvasIds.length > 0) {
    const { data: shares } = await supabase
      .from("canvas_shares")
      .select("canvas_id, permission")
      .in("canvas_id", canvasIds)
      .eq("shared_with_user_id", user.id);

    for (const share of shares ?? []) {
      if (share.permission === "editor" || share.permission === "viewer") {
        sharedPermissions[share.canvas_id] = share.permission;
      }
    }
  }

  return NextResponse.json((data ?? []).map((canvas) =>
    dbToCanvas(canvas as Record<string, unknown>, { currentUserId: user.id, sharedPermissions })
  ));
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
    .select(CANVAS_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(dbToCanvas(data as Record<string, unknown>, { currentUserId: user.id }), { status: 201 });
}
