import { requireDashboardOwner } from "@/lib/auth/dashboardOwner";
import {
  buildScheduleInput,
  dbToReportSchedule,
  type ReportScheduleRow,
} from "@/lib/reports/schedules";
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
    .from("report_schedules")
    .select("*")
    .eq("user_id", auth.user!.id)
    .eq("dashboard_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data ? dbToReportSchedule(data as ReportScheduleRow) : null });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireDashboardOwner(id);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const built = buildScheduleInput(body);
  if (!built.data) {
    return NextResponse.json({ error: built.error ?? "Invalid schedule" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("report_schedules")
    .upsert({
      user_id: auth.user!.id,
      dashboard_id: id,
      ...built.data,
    }, { onConflict: "user_id,dashboard_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: dbToReportSchedule(data as ReportScheduleRow) });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireDashboardOwner(id);
  if (auth.error) return auth.error;

  const { error } = await auth.supabase
    .from("report_schedules")
    .delete()
    .eq("user_id", auth.user!.id)
    .eq("dashboard_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: true });
}
