import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { generateReportBlueprint } from "@/lib/reports/blueprintGenerator";
import { runWithJob } from "@/lib/reports/jobTracker";
import { isOneOf, REPORT_TYPES } from "@/lib/reports/models";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ReportType } from "@/types";

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

  const { job, result } = await runWithJob(supabase, id, "generate_blueprint", 1, async (updateProgress) => {
    await updateProgress("Generating report outline", 0, 1);

    const output = await generateReportBlueprint(supabase, id, {
      instructions: body.instructions,
      audience: body.audience,
      reportType: requestedReportType as ReportType | undefined,
    }, user.id);

    await updateProgress("Blueprint generated", 1, 1);

    await logReportAction(supabase, user.id, "generate_blueprint", {
      reportProjectId: id,
      inputPayload: body as Record<string, unknown>,
      outputSummary: {
        report_blueprint_id: output.blueprint.id,
        section_count: output.sections.length,
        warning_count: output.warnings.length,
      },
      aiModel: "claude-haiku-4-5-20251001",
    });

    return output;
  });

  if (job.status === "failed") {
    const message = job.errorMessage ?? "Blueprint generation failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message, job_id: job.id }, { status });
  }

  return NextResponse.json({
    status: true,
    job_id: job.id,
    blueprint_id: result.blueprint.id,
    blueprint: result.blueprint,
    sections: result.sections,
    warnings: result.warnings,
  });
}
