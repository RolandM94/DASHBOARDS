import { requireDashboardOwner } from "@/lib/auth/dashboardOwner";
import {
  dbToSlackIntegration,
  validateSlackWebhookUrl,
  type SlackIntegrationRow,
} from "@/lib/reports/slack";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireDashboardOwner(id);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("slack_integrations")
    .select("*")
    .eq("user_id", auth.user!.id)
    .eq("dashboard_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integration: data ? dbToSlackIntegration(data as SlackIntegrationRow) : null });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireDashboardOwner(id);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({})) as {
    webhookUrl?: unknown;
    channelName?: unknown;
    active?: unknown;
  };
  const validated = validateSlackWebhookUrl(body.webhookUrl);
  if (!validated.url) {
    return NextResponse.json({ error: validated.error ?? "Invalid Slack webhook URL" }, { status: 400 });
  }

  const channelName = typeof body.channelName === "string" && body.channelName.trim()
    ? body.channelName.trim().slice(0, 80)
    : null;

  const { data, error } = await auth.supabase
    .from("slack_integrations")
    .upsert({
      user_id: auth.user!.id,
      dashboard_id: id,
      webhook_url: validated.url,
      channel_name: channelName,
      active: body.active !== false,
    }, { onConflict: "user_id,dashboard_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integration: dbToSlackIntegration(data as SlackIntegrationRow) });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireDashboardOwner(id);
  if (auth.error) return auth.error;

  const { error } = await auth.supabase
    .from("slack_integrations")
    .delete()
    .eq("user_id", auth.user!.id)
    .eq("dashboard_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: true });
}
