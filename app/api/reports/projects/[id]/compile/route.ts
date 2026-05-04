import { createClient } from "@/lib/supabase/server";
import { createJob } from "@/lib/reports/jobTracker";
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

  const job = await createJob(supabase, id, "compile_report", 1, {
    blueprintId: body.blueprint_id ?? body.blueprintId,
    includeAppendices: body.include_appendices ?? body.includeAppendices,
    allowPreview: Boolean(body.allow_preview ?? body.allowPreview),
  });

  return NextResponse.json({
    status: true,
    job_id: job.id,
    message: "Report compilation queued",
  }, { status: 202 });
}
