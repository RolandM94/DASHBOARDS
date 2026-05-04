import { createClient } from "@/lib/supabase/server";
import { createJob } from "@/lib/reports/jobTracker";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ActiveGlobalFilters, ActiveSmartFilters } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    active_filters?: ActiveGlobalFilters;
    activeFilters?: ActiveGlobalFilters;
    active_smart_filters?: ActiveSmartFilters;
    activeSmartFilters?: ActiveSmartFilters;
  };

  const job = await createJob(supabase, id, "capture_source_snapshot", 1, {
    activeFilters: body.active_filters ?? body.activeFilters ?? {},
    activeSmartFilters: body.active_smart_filters ?? body.activeSmartFilters ?? [],
  });

  return NextResponse.json({
    status: true,
    job_id: job.id,
    message: "Source capture queued",
  }, { status: 202 });
}
