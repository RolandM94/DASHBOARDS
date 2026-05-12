import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function isLikelyBot(userAgent: string): boolean {
  return /bot|crawler|spider|slurp|facebookexternalhit|preview|monitor|uptime/i.test(userAgent);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (isLikelyBot(userAgent)) {
    return NextResponse.json({ recorded: false, reason: "bot" });
  }

  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: dashboard, error: dashboardError } = await serviceClient
    .from("dashboards")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (dashboardError) {
    return NextResponse.json({ error: dashboardError.message }, { status: 500 });
  }
  if (!dashboard) {
    return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? null;
  const referrer = request.headers.get("referer");

  const { error } = await serviceClient
    .from("dashboard_views")
    .insert({
      dashboard_id: id,
      user_id: user?.id ?? null,
      is_anonymous: !user,
      ip_address: ip,
      user_agent: userAgent || null,
      referrer,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recorded: true });
}
