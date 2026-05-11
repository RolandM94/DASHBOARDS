import { createServiceClient } from "@/lib/supabase/server";
import {
  calculateNextSendAt,
  type ReportScheduleRow,
} from "@/lib/reports/schedules";
import {
  loadScheduledDashboardScope,
  renderDashboardPdfExport,
  renderDashboardXlsxExport,
} from "@/lib/reports/dashboardExports";
import { sendScheduleEmail } from "@/lib/reports/emailDelivery";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const maxDuration = 60;
export const runtime = "nodejs";

const BATCH_LIMIT = 3;
const CLAIM_TIMEOUT_MINUTES = 20;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const serviceClient = await createServiceClient();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MINUTES * 60_000).toISOString();
  const { data, error } = await serviceClient
    .from("report_schedules")
    .select("*")
    .eq("active", true)
    .lte("next_send_at", now.toISOString())
    .or(`processing_at.is.null,processing_at.lt.${staleBefore}`)
    .order("next_send_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const schedule of (data ?? []) as ReportScheduleRow[]) {
    results.push(await processSchedule(serviceClient, schedule));
  }

  return NextResponse.json({ processed: results.length, results });
}

async function processSchedule(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  schedule: ReportScheduleRow
) {
  const startedAt = new Date();
  const claimTime = startedAt.toISOString();
  const { data: claimed, error: claimError } = await serviceClient
    .from("report_schedules")
    .update({ processing_at: claimTime, last_attempt_at: claimTime })
    .eq("id", schedule.id)
    .eq("active", true)
    .select("*")
    .single();

  if (claimError || !claimed) {
    return { scheduleId: schedule.id, status: "skipped", message: "Could not claim schedule" };
  }

  const claimedSchedule = claimed as ReportScheduleRow;
  if (claimedSchedule.recipients.length === 0) {
    const nextSendAt = calculateNextSendAt({
      frequency: claimedSchedule.frequency,
      timeOfDay: claimedSchedule.time_of_day,
      timezone: claimedSchedule.timezone,
      dayOfWeek: claimedSchedule.day_of_week,
      dayOfMonth: claimedSchedule.day_of_month,
      from: startedAt,
    }).toISOString();
    await finishSchedule(serviceClient, claimedSchedule, {
      status: "skipped",
      message: "No recipients configured",
      nextSendAt,
      startedAt,
    });
    return { scheduleId: schedule.id, status: "skipped", message: "No recipients configured" };
  }

  try {
    const scope = await loadScheduledDashboardScope(serviceClient, claimedSchedule.dashboard_id);
    const artifact = claimedSchedule.format === "xlsx"
      ? await renderDashboardXlsxExport(serviceClient, scope)
      : await renderDashboardPdfExport(serviceClient, scope);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://supercool-stuff.vercel.app").replace(/\/$/, "");
    await sendScheduleEmail({
      schedule: claimedSchedule,
      dashboardTitle: scope.dashboard.title,
      dashboardUrl: `${appUrl}/dashboard/${claimedSchedule.dashboard_id}`,
      artifact,
    });

    const nextSendAt = calculateNextSendAt({
      frequency: claimedSchedule.frequency,
      timeOfDay: claimedSchedule.time_of_day,
      timezone: claimedSchedule.timezone,
      dayOfWeek: claimedSchedule.day_of_week,
      dayOfMonth: claimedSchedule.day_of_month,
      from: startedAt,
    }).toISOString();

    await finishSchedule(serviceClient, claimedSchedule, {
      status: "sent",
      message: `Sent ${artifact.filename}`,
      nextSendAt,
      startedAt,
    });
    return { scheduleId: schedule.id, status: "sent", nextSendAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Schedule delivery failed";
    await finishSchedule(serviceClient, claimedSchedule, {
      status: "failed",
      error: message,
      startedAt,
    });
    return { scheduleId: schedule.id, status: "failed", error: message };
  }
}

async function finishSchedule(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  schedule: ReportScheduleRow,
  result: {
    status: "sent" | "skipped" | "failed";
    message?: string;
    error?: string;
    nextSendAt?: string;
    startedAt: Date;
  }
) {
  const finishedAt = new Date().toISOString();
  await serviceClient.from("report_schedule_runs").insert({
    schedule_id: schedule.id,
    user_id: schedule.user_id,
    dashboard_id: schedule.dashboard_id,
    status: result.status,
    format: schedule.format,
    recipients: schedule.recipients,
    message: result.message ?? null,
    error: result.error ?? null,
    started_at: result.startedAt.toISOString(),
    finished_at: finishedAt,
  });

  const patch: Record<string, unknown> = {
    processing_at: null,
    last_attempt_at: finishedAt,
  };
  if (result.status === "sent" || result.status === "skipped") {
    patch.last_sent_at = result.status === "sent" ? finishedAt : schedule.last_sent_at;
    patch.next_send_at = result.nextSendAt;
    patch.failure_count = 0;
    patch.last_error = null;
  } else {
    patch.failure_count = schedule.failure_count + 1;
    patch.last_error = result.error ?? "Schedule delivery failed";
  }

  await serviceClient
    .from("report_schedules")
    .update(patch)
    .eq("id", schedule.id);
}
