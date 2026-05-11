import { requireDashboardOwner } from "@/lib/auth/dashboardOwner";
import { createServiceClient } from "@/lib/supabase/server";
import {
  collectDashboardExportData,
  loadScheduledDashboardScope,
} from "@/lib/reports/dashboardExports";
import {
  buildSlackPayload,
  extractSlackKpiSummaries,
  sendSlackWebhook,
  type SlackIntegrationRow,
} from "@/lib/reports/slack";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireDashboardOwner(id);
  if (auth.error) return auth.error;

  const { data: integration, error: integrationError } = await auth.supabase
    .from("slack_integrations")
    .select("*")
    .eq("user_id", auth.user!.id)
    .eq("dashboard_id", id)
    .eq("active", true)
    .maybeSingle();

  if (integrationError) return NextResponse.json({ error: integrationError.message }, { status: 500 });
  if (!integration) return NextResponse.json({ error: "Slack integration is not configured" }, { status: 404 });

  try {
    const row = integration as SlackIntegrationRow;
    const serviceClient = await createServiceClient();
    const scope = await loadScheduledDashboardScope(serviceClient, id);
    const exportData = await collectDashboardExportData(serviceClient, scope);
    const metrics = extractSlackKpiSummaries(scope, exportData);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://supercool-stuff.vercel.app").replace(/\/$/, "");
    const payload = buildSlackPayload({
      dashboardTitle: scope.dashboard.title,
      dashboardUrl: `${appUrl}/dashboard/${id}`,
      metrics,
      context: "Manual dashboard share",
    });

    await sendSlackWebhook(row.webhook_url, payload);
    const sharedAt = new Date().toISOString();
    await auth.supabase
      .from("slack_integrations")
      .update({ last_shared_at: sharedAt })
      .eq("id", row.id)
      .eq("user_id", auth.user!.id);

    return NextResponse.json({
      sent: true,
      metricsIncluded: metrics.length,
      lastSharedAt: sharedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not share to Slack" },
      { status: 500 }
    );
  }
}
