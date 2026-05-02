import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { SECTION_GENERATOR_MODEL, generateReportSection } from "@/lib/reports/sectionGenerator";
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

  const { data: sectionRow } = await supabase
    .from("report_sections")
    .select("report_project_id")
    .eq("id", id)
    .single();

  const projectId = sectionRow?.report_project_id;
  if (!projectId) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const { job, result } = await runWithJob(supabase, projectId, "generate_section", 1, async (updateProgress) => {
    await updateProgress("Generating section", 0, 1);

    const output = await generateReportSection(supabase, id, {
      instructions: body.instructions,
      allowPreview: Boolean(body.allow_preview ?? body.allowPreview),
    });

    await logReportAction(supabase, user.id, "generate_section", {
      reportProjectId: output.section.reportProjectId,
      inputPayload: body as Record<string, unknown>,
      outputSummary: { report_section_id: id, warning_count: output.output.warnings.length },
      aiModel: SECTION_GENERATOR_MODEL,
    });

    await updateProgress("Section generated", 1, 1);
    return output;
  });

  if (job.status === "failed") {
    const message = job.errorMessage ?? "Section generation failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message, job_id: job.id }, { status });
  }

  return NextResponse.json({
    status: true,
    job_id: job.id,
    section: result.section,
    output: result.output,
  });
}
