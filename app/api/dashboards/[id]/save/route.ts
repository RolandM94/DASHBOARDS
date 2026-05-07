import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ saved: false });
  }

  const { data: existing } = await supabase
    .from("saved_dashboards")
    .select("id")
    .eq("user_id", user.id)
    .eq("dashboard_id", id)
    .maybeSingle();

  return NextResponse.json({ saved: !!existing });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("saved_dashboards")
    .select("id")
    .eq("user_id", user.id)
    .eq("dashboard_id", id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("saved_dashboards")
      .delete()
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ saved: false });
  }

  const { error } = await supabase
    .from("saved_dashboards")
    .insert({ user_id: user.id, dashboard_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
