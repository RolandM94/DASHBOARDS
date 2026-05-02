import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { captureReportSource } from "@/lib/reports/sourceReader";
import { runWithJob } from "@/lib/reports/jobTracker";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ActiveGlobalFilters, ActiveSmartFilters } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    active_filters?: ActiveGlobalFilters;
    activeFilters?: ActiveGlobalFilters;
    active_smart_filters?: ActiveSmartFilters;
    activeSmartFilters?: ActiveSmartFilters;
  };

  const { job, result } = await runWithJob(supabase, id, "capture_source_snapshot", 1, async (updateProgress) => {
    await updateProgress("Capturing dashboard data", 0, 1);

    const output = await captureReportSource(supabase, serviceClient, id, {
      activeFilters: body.active_filters ?? body.activeFilters ?? {},
      activeSmartFilters: body.active_smart_filters ?? body.activeSmartFilters ?? [],
    });

    await updateProgress("Source snapshot saved", 1, 1);

    await logReportAction(supabase, user.id, "capture_source_snapshot", {
      reportProjectId: id,
      inputPayload: body as Record<string, unknown>,
      outputSummary: {
        snapshot_id: output.snapshotId,
        widgets_captured: output.sourcePackage.metadata.widget_count,
        worksheets_captured: output.sourcePackage.metadata.worksheet_count,
        failed_widgets: output.sourcePackage.metadata.failed_widgets,
      },
    });

    return output;
  });

  if (job.status === "failed") {
    return NextResponse.json({ error: job.errorMessage, job_id: job.id }, { status: 500 });
  }

  return NextResponse.json({
    status: true,
    job_id: job.id,
    snapshot_id: result.snapshotId,
    summary: {
      widgets_captured: result.sourcePackage.metadata.widget_count,
      worksheets_captured: result.sourcePackage.metadata.worksheet_count,
      failed_widgets: result.sourcePackage.metadata.failed_widgets,
      warnings: result.sourcePackage.warnings,
    },
  });
}
