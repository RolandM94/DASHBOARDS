import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { PublishedDashboard } from "@/types";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: saved, error: savedErr } = await supabase
    .from("saved_dashboards")
    .select("dashboard_id, saved_at")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  if (savedErr) {
    return NextResponse.json({ error: savedErr.message }, { status: 500 });
  }

  if (saved.length === 0) {
    return NextResponse.json({ dashboards: [] });
  }

  const dashboardIds = saved.map((s) => s.dashboard_id);
  const savedAtMap = new Map(saved.map((s) => [s.dashboard_id, s.saved_at]));

  const serviceClient = await createServiceClient();
  const { data: dashboards, error: dashErr } = await serviceClient
    .from("dashboards")
    .select("id, canvas_id, title, permission, published_at, blocks, layout")
    .in("id", dashboardIds);

  if (dashErr) {
    return NextResponse.json({ error: dashErr.message }, { status: 500 });
  }

  const mapped: (PublishedDashboard & { savedAt: string })[] = (dashboards ?? []).map((d) => ({
    id: d.id,
    canvasId: d.canvas_id,
    title: d.title,
    permission: d.permission,
    publishedAt: d.published_at,
    blocks: d.blocks,
    layout: d.layout,
    savedAt: savedAtMap.get(d.id) ?? "",
  }));

  return NextResponse.json({ dashboards: mapped });
}
