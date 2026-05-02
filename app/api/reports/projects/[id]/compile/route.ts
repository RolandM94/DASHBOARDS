import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { compileReport } from "@/lib/reports/reportCompiler";
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
    blueprint_id?: string;
    blueprintId?: string;
    include_appendices?: boolean;
    includeAppendices?: boolean;
    allow_preview?: boolean;
    allowPreview?: boolean;
  };

  const { job, result } = await runWithJob(supabase, id, "compile_report", 1, async (updateProgress) => {
    await updateProgress("Compiling report", 0, 1);

    const output = await compileReport(supabase, id, {
      blueprintId: body.blueprint_id ?? body.blueprintId,
      includeAppendices: body.include_appendices ?? body.includeAppendices,
      allowPreview: Boolean(body.allow_preview ?? body.allowPreview),
      compiledBy: user.id,
    });

    await logReportAction(supabase, user.id, "compile_report", {
      reportProjectId: id,
      inputPayload: body as Record<string, unknown>,
      outputSummary: {
        report_compilation_id: output.compilation.id,
        report_blueprint_id: output.compilation.reportBlueprintId,
        section_count: output.payload.sections.length,
        appendix_count: output.payload.appendices.length,
        warning_count: output.payload.warnings.length,
      },
    });

    await updateProgress("Report compiled", 1, 1);
    return output;
  });

  if (job.status === "failed") {
    return NextResponse.json({ error: job.errorMessage ?? "Report compilation failed", job_id: job.id }, { status: 400 });
  }

  return NextResponse.json({
    status: true,
    job_id: job.id,
    compilation: result.compilation,
    payload: result.payload,
  });
}
