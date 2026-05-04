import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { exportReport } from "@/lib/reports/exportEngine";
import { REPORT_EXPORT_FORMATS } from "@/lib/reports/models";
import { runWithJob } from "@/lib/reports/jobTracker";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ReportExportFormat } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    format?: ReportExportFormat;
    export_options?: Record<string, unknown>;
    exportOptions?: Record<string, unknown>;
    compilation_id?: string;
    compilationId?: string;
  };

  if (!REPORT_EXPORT_FORMATS.includes(body.format as ReportExportFormat)) {
    return NextResponse.json({ error: "Invalid export format" }, { status: 400 });
  }

  const { job, result } = await runWithJob(supabase, id, "export_report", 1, async (updateProgress) => {
    await updateProgress(`Exporting ${(body.format ?? "docx").toUpperCase()}`, 0, 1);

    const output = await exportReport(supabase, id, {
      format: body.format as ReportExportFormat,
      exportOptions: (body.export_options ?? body.exportOptions ?? {}) as Record<string, unknown>,
      compilationId: body.compilation_id ?? body.compilationId,
      exportedBy: user.id,
    });

    await logReportAction(supabase, user.id, "export_report", {
      reportProjectId: id,
      inputPayload: body as Record<string, unknown>,
      outputSummary: {
        report_export_id: output.exportRecord.id,
        format: output.exportRecord.format,
        download_url: output.artifact.downloadUrl,
        compilation_id: output.artifact.compilationId,
      },
    });

    await updateProgress("Export ready", 1, 1);
    return output;
  });

  if (job.status === "failed") {
    return NextResponse.json({ error: job.errorMessage ?? "Report export failed", job_id: job.id }, { status: 400 });
  }

  return NextResponse.json({
    status: true,
    job_id: job.id,
    export: result.exportRecord,
    artifact: result.artifact,
  }, { status: 201 });
}
