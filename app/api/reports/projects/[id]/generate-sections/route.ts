import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { SECTION_GENERATOR_MODEL, generateAllReportSections } from "@/lib/reports/sectionGenerator";
import { runWithJob } from "@/lib/reports/jobTracker";
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
    allow_preview?: boolean;
    allowPreview?: boolean;
  };

  const { job, result } = await runWithJob(supabase, id, "generate_all_sections", 1, async (updateProgress) => {
    await updateProgress("Generating report sections", 0, 1);

    const output = await generateAllReportSections(supabase, id, {
      instructions: body.instructions,
      allowPreview: Boolean(body.allow_preview ?? body.allowPreview),
    });

    for (const generated of output.generated) {
      await logReportAction(supabase, user.id, "generate_section", {
        reportProjectId: generated.section.reportProjectId,
        inputPayload: { ...body as Record<string, unknown>, report_section_id: generated.section.id },
        outputSummary: { report_section_id: generated.section.id, warning_count: generated.output.warnings.length },
        aiModel: SECTION_GENERATOR_MODEL,
      });
    }

    for (const failed of output.failed) {
      await logReportAction(supabase, user.id, "generate_section", {
        reportProjectId: id,
        inputPayload: { ...body as Record<string, unknown>, report_section_id: failed.sectionId },
        status: "failed",
        errorMessage: failed.error,
        aiModel: SECTION_GENERATOR_MODEL,
      });
    }

    await logReportAction(supabase, user.id, "generate_all_sections", {
      reportProjectId: id,
      inputPayload: body as Record<string, unknown>,
      outputSummary: { generated_count: output.generated.length, failed_count: output.failed.length },
      status: output.failed.length > 0 ? "failed" : "success",
      aiModel: SECTION_GENERATOR_MODEL,
    });

    await updateProgress("Sections generated", 1, 1);
    return output;
  });

  if (job.status === "failed") {
    const message = job.errorMessage ?? "Report section generation failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message, job_id: job.id }, { status });
  }

  return NextResponse.json({
    status: result.failed.length === 0,
    job_id: job.id,
    generated: result.generated,
    failed: result.failed,
    summary: { generated_count: result.generated.length, failed_count: result.failed.length },
  });
}
