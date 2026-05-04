import { createClient } from "@/lib/supabase/server";
import { createJob } from "@/lib/reports/jobTracker";
import { isOneOf, REPORT_TYPES } from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    instructions?: string;
    audience?: string;
    report_type?: string;
    reportType?: string;
  };

  const requestedReportType = body.report_type ?? body.reportType;
  if (requestedReportType !== undefined && !isOneOf(requestedReportType, REPORT_TYPES)) {
    return NextResponse.json({ error: "Invalid report_type" }, { status: 400 });
  }

  const job = await createJob(supabase, id, "generate_blueprint", 1, {
    instructions: body.instructions,
    audience: body.audience,
    reportType: requestedReportType,
  });

  return NextResponse.json({
    status: true,
    job_id: job.id,
    message: "Blueprint generation queued",
  }, { status: 202 });
}
