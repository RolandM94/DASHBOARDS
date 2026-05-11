import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function requireDashboardOwner(dashboardId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { supabase, error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }

  const { data: dashboard } = await supabase
    .from("dashboards")
    .select("id, user_id, title")
    .eq("id", dashboardId)
    .eq("user_id", user.id)
    .single();

  if (!dashboard) {
    return { supabase, user, error: NextResponse.json({ error: "Dashboard not found or access denied" }, { status: 404 }) };
  }

  return { supabase, user, dashboard };
}
