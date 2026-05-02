import { createClient } from "@/lib/supabase/server";
import { logReportAction } from "@/lib/reports/api";
import { requestReportChanges } from "@/lib/reports/approvalWorkflow";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/reports/projects/[id]/request-changes
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { reason?: string };

  try {
    const project = await requestReportChanges(supabase, id, user.id, body.reason);
    await logReportAction(supabase, user.id, "request_report_changes", {
      reportProjectId: id,
      inputPayload: body as Record<string, unknown>,
      outputSummary: { status: project.status },
    });
    return NextResponse.json({ status: true, project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report changes could not be requested" },
      { status: 400 }
    );
  }
}
