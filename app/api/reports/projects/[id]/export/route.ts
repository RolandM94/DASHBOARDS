import { createClient } from "@/lib/supabase/server";
import { createJob } from "@/lib/reports/jobTracker";
import { REPORT_EXPORT_FORMATS } from "@/lib/reports/models";
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

  const job = await createJob(supabase, id, "export_report", 1, {
    format: body.format,
    exportOptions: (body.export_options ?? body.exportOptions ?? {}),
    compilationId: body.compilation_id ?? body.compilationId,
  });

  return NextResponse.json({
    status: true,
    job_id: job.id,
    message: "Report export queued",
  }, { status: 202 });
}
